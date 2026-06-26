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
    const forumCommentsCollection = client.db('fitsphere_DB').collection('forumComments');
    const forumVotesCollection = client.db('fitsphere_DB').collection('forumVotes');
    const trainerApplicationsCollection = client.db('fitsphere_DB').collection('trainerApplications');
    const usersCollection = client.db('fitsphere_DB').collection('user');


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


    // =============================
    // app.post/api/classes
    // ==============================
    app.post("/api/classes", async (req, res) => {
      try {
        const {
          title,
          image,
          description,
          category,
          level,
          duration,
          capacity,
          price,
          schedule,
          location,
          trainerId,
          trainerName,
        } = req.body;

        if (
          !title ||
          !image ||
          !description ||
          !category ||
          !level ||
          !duration ||
          !capacity ||
          !price ||
          !schedule ||
          !location ||
          !trainerId ||
          !trainerName
        ) {
          return res.status(400).send({
            success: false,
            message: "All fields are required.",
          });
        }

        const newClass = {
          title,
          image,
          description,
          category,
          level,
          duration,
          capacity: Number(capacity),
          price: Number(price),
          schedule,
          location,
          trainerId,
          trainerName,
          trainer: trainerName,
          enrolledMembers: [],
          enrolledCount: 0,
          rating: 0,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await classesCollection.insertOne(newClass);

        res.status(201).send({
          success: true,
          message: "Class submitted successfully and is pending admin approval.",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Create class error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create class.",
          error: error.message,
        });
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
    // GET FORUM POSTS BY AUTHOR
    // ==========================================
    app.get("/api/forum-posts/author/:authorId", async (req, res) => {
      try {
        const { authorId } = req.params;

        if (!authorId) {
          return res.status(400).send({
            success: false,
            message: "authorId is required",
          });
        }

        const posts = await forumPostsCollection
          .find({ authorId })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(posts);
      } catch (error) {
        console.error("Error fetching author forum posts:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch author forum posts",
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
          authorId: post.authorId,
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
        if (!post.authorId) {
          return res.status(400).send({
            success: false,
            message: "authorId is required",
          });
        }
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

    // ==========================================
    // DELETE FORUM POST
    // ==========================================
    app.delete("/api/forum-posts/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid post id",
          });
        }

        const result = await forumPostsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Post not found",
          });
        }

        res.status(200).send({
          success: true,
          message: "Post deleted successfully",
        });
      } catch (error) {
        console.error("Delete forum post error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to delete forum post",
          error: error.message,
        });
      }
    });

    // ==========================================
    // Update forum post
    // ==========================================
    app.patch("/api/forum-posts/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid post id",
          });
        }

        const {
          title,
          image,
          shortDescription,
          content,
          category,
          status,
        } = req.body;

        const updateDoc = {
          updatedAt: new Date(),
        };

        if (title) updateDoc.title = title;
        if (image) updateDoc.image = image;
        if (shortDescription) updateDoc.shortDescription = shortDescription;
        if (content) updateDoc.content = content;
        if (category) updateDoc.category = category;
        if (status) updateDoc.status = status;

        const result = await forumPostsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateDoc }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Post not found",
          });
        }

        res.status(200).send({
          success: true,
          message: "Forum post updated successfully",
        });
      } catch (error) {
        console.error("Update forum post error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to update forum post",
          error: error.message,
        });
      }
    });



    // ==============================
    // GET Comments by post id
    // ==============================
    app.get("/api/forum-comments/:postId", async (req, res) => {
      try {
        const { postId } = req.params;

        const comments = await forumCommentsCollection
          .find({ postId })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(comments);
      } catch (error) {
        console.error("Error fetching comments:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch comments",
          error: error.message,
        });
      }
    });

    // ==============================
    // CREATE COMMENT
    // ==============================
    app.post("/api/forum-comments", async (req, res) => {
      try {
        const {
          postId,
          userId,
          userName,
          userImage,
          comment,
        } = req.body;

        if (
          !postId ||
          !userId ||
          !userName ||
          !comment
        ) {
          return res.status(400).send({
            success: false,
            message: "Missing required fields",
          });
        }

        const newComment = {
          postId,
          userId,
          userName,
          userImage: userImage || "",
          comment,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await forumCommentsCollection.insertOne(newComment);

        res.status(201).send({
          success: true,
          message: "Comment added successfully",
          insertedId: result.insertedId,
          comment: newComment,
        });
      } catch (error) {
        console.error("Error creating comment:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create comment",
          error: error.message,
        });
      }
    });

    // ==============================
    //   GET Forum Votes
    // ==============================
    app.get("/api/forum-votes/:postId", async (req, res) => {
      try {
        const { postId } = req.params;
        const { userId } = req.query;

        const totalLikes = await forumVotesCollection.countDocuments({
          postId,
          voteType: "like",
        });

        const totalDislikes = await forumVotesCollection.countDocuments({
          postId,
          voteType: "dislike",
        });

        let currentUserVote = null;

        if (userId) {
          const userVote = await forumVotesCollection.findOne({
            postId,
            userId,
          });

          currentUserVote = userVote?.voteType || null;
        }

        res.status(200).send({
          totalLikes,
          totalDislikes,
          currentUserVote,
        });
      } catch (error) {
        console.error("Error fetching forum votes:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch forum votes",
          error: error.message,
        });
      }
    });

    // ==============================
    //   CREATE FORUM VOTE
    // ==============================
    app.post("/api/forum-votes", async (req, res) => {
      try {
        const { postId, userId, voteType } = req.body;

        if (!postId || !userId || !voteType) {
          return res.status(400).send({
            success: false,
            message: "postId, userId, and voteType are required",
          });
        }

        if (!["like", "dislike"].includes(voteType)) {
          return res.status(400).send({
            success: false,
            message: "voteType must be like or dislike",
          });
        }

        const existingVote = await forumVotesCollection.findOne({
          postId,
          userId,
        });

        if (!existingVote) {
          await forumVotesCollection.insertOne({
            postId,
            userId,
            voteType,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        } else if (existingVote.voteType === voteType) {
          await forumVotesCollection.deleteOne({
            postId,
            userId,
          });
        } else {
          await forumVotesCollection.updateOne(
            { postId, userId },
            {
              $set: {
                voteType,
                updatedAt: new Date(),
              },
            }
          );
        }

        const totalLikes = await forumVotesCollection.countDocuments({
          postId,
          voteType: "like",
        });

        const totalDislikes = await forumVotesCollection.countDocuments({
          postId,
          voteType: "dislike",
        });

        const updatedVote = await forumVotesCollection.findOne({
          postId,
          userId,
        });

        res.status(200).send({
          success: true,
          message: "Vote updated successfully",
          totalLikes,
          totalDislikes,
          currentUserVote: updatedVote?.voteType || null,
        });
      } catch (error) {
        console.error("Error updating forum vote:", error);

        res.status(500).send({
          success: false,
          message: "Failed to update forum vote",
          error: error.message,
        });
      }
    });


    // ==============================
    //   POST Member Aplication as Trainer
    // ==============================
    app.post("/api/trainer-applications", async (req, res) => {
      try {
        const {
          userId,
          userName,
          userEmail,
          image,
          experience,
          skills,
          certification,
          bio,
        } = req.body;

        // Validate required fields
        if (
          !userId ||
          !userName ||
          !userEmail ||
          !image ||
          !experience ||
          !skills ||
          !certification ||
          !bio
        ) {
          return res.status(400).send({
            success: false,
            message: "All fields are required.",
          });
        }

        // Check for existing pending application
        const existingApplication = await trainerApplicationsCollection.findOne({
          userId,
          status: { $in: ["pending", "approved"] },
        });

        if (existingApplication) {
          return res.status(409).send({
            success: false,
            message:
              existingApplication.status === "pending"
                ? "You already have a pending trainer application."
                : "You are already approved as a trainer.",
          });
        }

        const application = {
          userId,
          userName,
          userEmail,
          image,
          experience,
          skills,
          certification,
          bio,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await trainerApplicationsCollection.insertOne(application);

        res.status(201).send({
          success: true,
          message: "Trainer application submitted successfully.",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Trainer application error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to submit trainer application.",
          error: error.message,
        });
      }
    });


    // ==============================
    // GET All Trainer Applications
    // ==============================

    app.get("/api/trainer-applications", async (req, res) => {
      try {
        const applications = await trainerApplicationsCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(applications);
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to fetch trainer applications.",
          error: error.message,
        });
      }
    });

    // ==============================
    //    PATCH Application Status
    // ==============================
    app.patch("/api/trainer-applications/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status, userId } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid application id.",
          });
        }

        if (!["approved", "rejected"].includes(status)) {
          return res.status(400).send({
            success: false,
            message: "Status must be approved or rejected.",
          });
        }

        const updateApplication = await trainerApplicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          }
        );

        if (updateApplication.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Trainer application not found.",
          });
        }

        if (status === "approved") {
          await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            {
              $set: {
                role: "trainer",
                updatedAt: new Date(),
              },
            }
          );
        }

        res.status(200).send({
          success: true,
          message:
            status === "approved"
              ? "Application approved and user promoted to trainer."
              : "Application rejected successfully.",
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to update application status.",
          error: error.message,
        });
      }
    });

    // ==============================
    //  GET API users
    // ==============================
    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(users);
      } catch (error) {
        console.error("Error fetching users:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch users",
          error: error.message,
        });
      }
    });


    // ==============================
    // BLOCK/UNBLOCK USER
    // ==============================

    app.patch("/api/users/:id/block", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid user id" });
        }

        if (!["active", "blocked"].includes(status)) {
          return res.status(400).send({
            success: false,
            message: "Status must be active or blocked",
          });
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status, updatedAt: new Date() } }
        );

        res.send({
          success: true,
          message: `User ${status === "blocked" ? "blocked" : "unblocked"} successfully`,
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


    // ==============================
    // Role Update API
    // ==============================
    app.patch("/api/users/:id/role", async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid user id" });
        }

        if (!["member", "trainer", "admin"].includes(role)) {
          return res.status(400).send({
            success: false,
            message: "Role must be member, trainer, or admin",
          });
        }

        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role, updatedAt: new Date() } }
        );

        res.send({
          success: true,
          message: "User role updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });


    // ==============================
    //  GET /api/admin/classes
    // ==============================

    app.get("/api/admin/classes", async (req, res) => {
      try {
        const result = await classesCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching admin classes:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch classes",
          error: error.message,
        });
      }
    });

    // =============================
    //  PATCH /api/classes/:id/status
    // ==============================
    app.patch("/api/classes/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid class id",
          });
        }

        if (!["approved", "rejected", "pending"].includes(status)) {
          return res.status(400).send({
            success: false,
            message: "Status must be approved, rejected, or pending",
          });
        }

        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Class not found",
          });
        }

        res.status(200).send({
          success: true,
          message: `Class ${status} successfully`,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to update class status",
          error: error.message,
        });
      }
    });

    // ==============================
    //  DELETE /api/classes/:id
    // ==============================

    app.delete("/api/classes/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid class id",
          });
        }

        const result = await classesCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Class not found",
          });
        }

        res.status(200).send({
          success: true,
          message: "Class deleted successfully",
        });
      } catch (error) {
        console.error("Delete class error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to delete class",
          error: error.message,
        });
      }
    });


    // ==========================================
    // TRAINER: GET OWN CLASSES
    // ==========================================
    app.get("/api/classes/trainer/:trainerId", async (req, res) => {
      try {
        const { trainerId } = req.params;

        if (!trainerId) {
          return res.status(400).send({
            success: false,
            message: "Trainer ID is required.",
          });
        }

        const classes = await classesCollection
          .find({ trainerId })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send({
          success: true,
          total: classes.length,
          classes,
        });
      } catch (error) {
        console.error("Error fetching trainer classes:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch trainer classes.",
          error: error.message,
        });
      }
    });

    // ==========================================
    // TRAINER: GET ATTENDEES / BOOKINGS
    // ==========================================
    app.get("/api/bookings/trainer/:trainerId", async (req, res) => {
      try {
        const { trainerId } = req.params;

        if (!trainerId) {
          return res.status(400).send({
            success: false,
            message: "Trainer ID is required.",
          });
        }

        const bookings = await bookingsCollection
          .find({ trainerId })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send({
          success: true,
          total: bookings.length,
          bookings,
        });
      } catch (error) {
        console.error("Error fetching trainer bookings:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch trainer bookings.",
          error: error.message,
        });
      }
    });

    // ==========================================
    // MEMBER: GET MY BOOKINGS
    // ==========================================
    app.get("/api/bookings/user/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        if (!userId) {
          return res.status(400).send({
            success: false,
            message: "User ID is required.",
          });
        }

        const bookings = await bookingsCollection
          .find({ userId })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).send({
          success: true,
          total: bookings.length,
          bookings,
        });
      } catch (error) {
        console.error("Error fetching user bookings:", error);

        res.status(500).send({
          success: false,
          message: "Failed to fetch user bookings.",
          error: error.message,
        });
      }
    });


    // ==========================================
// MEMBER: GET FAVORITE CLASSES WITH DETAILS
// ==========================================
app.get("/api/favorites/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).send({
        success: false,
        message: "User ID is required.",
      });
    }

    const favorites = await favoritesCollection
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();

    const classIds = favorites
      .map((favorite) => favorite.classId)
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const favoriteClasses = await classesCollection
      .find({
        _id: { $in: classIds },
      })
      .toArray();

    const result = favoriteClasses.map((classItem) => {
      const favorite = favorites.find(
        (fav) => fav.classId === classItem._id.toString()
      );

      return {
        ...classItem,
        favoriteId: favorite?._id,
        favoritedAt: favorite?.createdAt,
      };
    });

    res.status(200).send({
      success: true,
      total: result.length,
      favorites: result,
    });
  } catch (error) {
    console.error("Error fetching favorite classes:", error);

    res.status(500).send({
      success: false,
      message: "Failed to fetch favorite classes.",
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