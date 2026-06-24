const express = require('express');
require('dotenv').config();
const cors = require('cors');

const app = express();
const port = 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = process.env.MONGODB_URI;

// Middleware
app.use(express.json());
app.use(cors());

// Routes
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Create a MongoClient
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    // Collections
    const classesCollection = client.db('fitsphere_DB').collection('classes');
    const forumPostsCollection = client.db('fitsphere_DB').collection('forumPosts');
    const bookingsCollection = client.db('fitsphere_DB').collection('bookings');
    const favoritesCollection = client.db('fitsphere_DB').collection('favorites');


    // ==========================================
    // UNIFIED CLASSES ROUTE (FIXED & COMBINED)
    // ==========================================
    app.get('/api/classes', async (req, res) => {
      try {
        // const classesCollection = client.db('fitsphere_DB').collection('classes');

        // 1. Read query values
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit) || 0;

        // 2. CASE A: LANDING PAGE (No page passed, just a limit like ?limit=3)
        // Send back a direct array so it doesn't break your home page setup
        if (!page && limit > 0 && limit <= 3) {
          const result = await classesCollection.find().limit(limit).toArray();
          return res.status(200).send(result);
        }


        // 3. CASE B: PAGINATION PAGE (e.g., ?page=1&limit=6&search=spin)
        const activePage = page || 1;
        const activeLimit = limit || 6;
        const skip = (activePage - 1) * activeLimit;

        // const searchQuery = req.query.search || "";
        // let queryFilter = {};

        // if (searchQuery) {
        //   queryFilter = {
        //     $or: [
        //       { title: { $regex: searchQuery, $options: "i" } }, // "i" for case-insensitive
        //       { trainer: { $regex: searchQuery, $options: "i" } }
        //     ]
        //   };
        // }
        const searchQuery = req.query.search || "";
        const categoryQuery = req.query.category || "";

        let queryFilter = {};

        if (searchQuery) {
          queryFilter.$or = [
            { title: { $regex: searchQuery, $options: "i" } },
            { trainer: { $regex: searchQuery, $options: "i" } }
          ];
        }

        if (categoryQuery && categoryQuery !== "All") {
          queryFilter.category = categoryQuery;
        }

        const totalItems = await classesCollection.countDocuments(queryFilter);

        // Fetch the data chunk from MongoDB
        let result = await classesCollection.find(queryFilter).skip(skip).limit(activeLimit).toArray();

        // --- BUBBLE SEARCH MATCH TO FIRST SLOT ON PAGE 1 ---
        if (searchQuery && activePage === 1 && result.length > 0) {
          // Find the index of the item that exactly matches or highly correlates to the search term
          const exactMatchIndex = result.findIndex(item =>
            item.title.toLowerCase().includes(searchQuery.toLowerCase())
          );

          // If found and it's not already the first item, move it to index 0
          if (exactMatchIndex > 0) {
            const [exactMatchItem] = result.splice(exactMatchIndex, 1);
            result.unshift(exactMatchItem); // Insert cleanly at the first position
          }
        }

        // Return wrapped response for HeroUI Pagination
        return res.status(200).send({
          classes: result,
          totalItems,
          totalPages: Math.ceil(totalItems / activeLimit) || 1
        });

      } catch (error) {
        console.error("Error fetching classes:", error);
        res.status(500).send({ message: "Internal Server Error", error: error.message });
      }
    });
    // ==========================================
    // DEtails CLASS ROUTE 
    // ==========================================
    app.get('/api/classes/:id', async (req, res) => {
      try {
        const classId = req.params.id;

        if (!ObjectId.isValid(classId)) {
          return res.status(400).send({ message: "Invalid class id" });
        }

        const result = await classesCollection.findOne({
          _id: new ObjectId(classId),
        });

        if (!result) {
          return res.status(404).send({ message: "Class not found" });
        }

        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching class:", error);
        res.status(500).send({
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });
    // ==========================================
    // BOOKING CHECK ROUTE
    // ==========================================
    app.get("/api/bookings/check", async (req, res) => {
      try {
        const { userId, classId } = req.query;

        if (!userId || !classId) {
          return res.status(400).send({
            alreadyBooked: false,
            message: "userId and classId are required",
          });
        }

        const booking = await bookingsCollection.findOne({
          userId,
          classId,
        });

        if (booking) {
          return res.status(200).send({
            alreadyBooked: true,
            booking,
          });
        }

        return res.status(200).send({
          alreadyBooked: false,
        });
      } catch (error) {
        console.error("Error checking booking:", error);
        res.status(500).send({
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    // ==========================================
    // CREATE BOOKING ROUTE
    // ==========================================
    app.post("/api/bookings", async (req, res) => {
      try {
        const { userId, classId } = req.body;

        if (!userId || !classId) {
          return res.status(400).send({
            success: false,
            message: "userId and classId are required",
          });
        }

        const alreadyBooked = await bookingsCollection.findOne({
          userId,
          classId,
        });

        if (alreadyBooked) {
          return res.status(409).send({
            success: false,
            message: "You have already booked this class",
          });
        }

        const classItem = await classesCollection.findOne({
          _id: new ObjectId(classId),
        });

        if (!classItem) {
          return res.status(404).send({
            success: false,
            message: "Class not found",
          });
        }

        if (classItem.status !== "approved") {
          return res.status(400).send({
            success: false,
            message: "This class is not available for booking",
          });
        }

        if (classItem.enrolledCount >= classItem.capacity) {
          return res.status(400).send({
            success: false,
            message: "Class is full",
          });
        }

        const bookingDoc = {
          userId,
          classId,
          trainerId: classItem.trainerId || null,
          trainer: classItem.trainer || null,
          classTitle: classItem.title,
          price: classItem.price || 0,
          paymentStatus: "approved",
          bookingStatus: "booked",
          createdAt: new Date(),
        };

        const result = await bookingsCollection.insertOne(bookingDoc);

        await classesCollection.updateOne(
          { _id: new ObjectId(classId) },
          { $inc: { enrolledCount: 1 } }
        );

        res.status(201).send({
          success: true,
          message: "Booking created successfully",
          bookingId: result.insertedId,
          booking: bookingDoc,
        });
      } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).send({
          success: false,
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    // ==========================================
    // FAVORITE CHECK ROUTE
    // ==========================================
    app.get("/api/favorites/check", async (req, res) => {
      try {
        const { userId, classId } = req.query;

        if (!userId || !classId) {
          return res.status(400).send({
            isFavorite: false,
            message: "userId and classId are required",
          });
        }

        const favorite = await favoritesCollection.findOne({
          userId,
          classId,
        });

        if (favorite) {
          return res.status(200).send({
            isFavorite: true,
            favorite,
          });
        }

        return res.status(200).send({
          isFavorite: false,
        });
      } catch (error) {
        console.error("Error checking favorite:", error);

        res.status(500).send({
          isFavorite: false,
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    // ==========================================
    // ADD FAVORITE ROUTE
    // ==========================================
    app.post("/api/favorites", async (req, res) => {
      try {
        const { userId, classId } = req.body;

        if (!userId || !classId) {
          return res.status(400).send({
            success: false,
            message: "userId and classId are required",
          });
        }

        if (!ObjectId.isValid(classId)) {
          return res.status(400).send({
            success: false,
            message: "Invalid class id",
          });
        }

        const classItem = await classesCollection.findOne({
          _id: new ObjectId(classId),
        });

        if (!classItem) {
          return res.status(404).send({
            success: false,
            message: "Class not found",
          });
        }

        const alreadyFavorite = await favoritesCollection.findOne({
          userId,
          classId,
        });

        if (alreadyFavorite) {
          return res.status(409).send({
            success: false,
            message: "Already in favorites",
          });
        }

        const favoriteDoc = {
          userId,
          classId,
          classTitle: classItem.title,
          trainerId: classItem.trainerId || null,
          trainer: classItem.trainer || null,
          image: classItem.image || null,
          category: classItem.category || null,
          level: classItem.level || null,
          createdAt: new Date(),
        };

        const result = await favoritesCollection.insertOne(favoriteDoc);

        res.status(201).send({
          success: true,
          message: "Successfully added to your favorites!",
          favoriteId: result.insertedId,
          favorite: favoriteDoc,
        });
      } catch (error) {
        console.error("Error adding favorite:", error);

        res.status(500).send({
          success: false,
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    // ==========================================
    // REMOVE FAVORITE ROUTE
    // ==========================================
    app.delete("/api/favorites", async (req, res) => {
      try {
        const { userId, classId } = req.body;

        if (!userId || !classId) {
          return res.status(400).send({
            success: false,
            message: "userId and classId are required",
          });
        }

        const favorite = await favoritesCollection.findOne({
          userId,
          classId,
        });

        if (!favorite) {
          return res.status(404).send({
            success: false,
            message: "Favorite not found",
          });
        }

        const result = await favoritesCollection.deleteOne({
          userId,
          classId,
        });

        if (result.deletedCount === 0) {
          return res.status(400).send({
            success: false,
            message: "Failed to remove favorite",
          });
        }

        res.status(200).send({
          success: true,
          message: "Favorite removed successfully",
        });
      } catch (error) {
        console.error("Error removing favorite:", error);

        res.status(500).send({
          success: false,
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    // ==========================================
    // GET ALL Published Forums posts
    // ==========================================
    app.get("/api/forum-posts", async (req, res) => {
      try {
        const result = await forumPostsCollection
          .find({
            status: "published",
            authorRole: { $in: ["trainer", "admin"] },
          })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching forum posts:", error);
        res.status(500).send({
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    // ==========================================
    // GET Single  Forums posts
    // ==========================================
    app.get("/api/forum-posts/:id", async (req, res) => {
      try {
        const postId = req.params.id;

        if (!ObjectId.isValid(postId)) {
          return res.status(400).send({ message: "Invalid post id" });
        }

        const result = await forumPostsCollection.findOne({
          _id: new ObjectId(postId),
        });

        if (!result) {
          return res.status(404).send({ message: "Post not found" });
        }

        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching forum post:", error);
        res.status(500).send({
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });
    // ==========================================
    // Create forum post
    // ==========================================
    app.post("/api/forum-posts", async (req, res) => {
      try {
        const post = req.body;

        const allowedRoles = ["trainer", "admin"];

        if (!allowedRoles.includes(post.authorRole)) {
          return res.status(403).send({
            success: false,
            message: "Only trainers and admins can create forum posts",
          });
        }

        if (
          !post.title ||
          !post.authorName ||
          !post.authorRole ||
          !post.image ||
          !post.shortDescription ||
          !post.content
        ) {
          return res.status(400).send({
            success: false,
            message: "Missing required fields",
          });
        }

        const newPost = {
          title: post.title,
          authorName: post.authorName,
          authorRole: post.authorRole,
          image: post.image,
          shortDescription: post.shortDescription,
          content: post.content,
          category: post.category || "General",
          status: post.status || "published",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await forumPostsCollection.insertOne(newPost);

        res.status(201).send({
          success: true,
          message: "Forum post created successfully",
          insertedId: result.insertedId,
          post: newPost,
        });
      } catch (error) {
        console.error("Error creating forum post:", error);
        res.status(500).send({
          success: false,
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  }
  catch (error) {
    console.error("Failed to connect to MongoDB", error);
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});