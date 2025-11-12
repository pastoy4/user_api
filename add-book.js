const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/DB_SV11_12";

app.use(express.json());
app.use(
    cors({
        origin: process.env.CORS_ORIGIN?.split(",") || true,
        credentials: true
    })
);

app.get("/", (_req, res) => {
    res.send("Library Management API is running. Available resources: /api/categories, /api/books");
});

mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => {
        console.error("❌ MongoDB connection error:", err.message);
        process.exit(1);
    });

// =======================================================
// SCHEMA & MODEL DEFINITIONS
// =======================================================

const categorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        bookCount: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    {
        timestamps: true,
        collection: "Categories"
    }
);

categorySchema.index({ name: 1 }, { unique: true });

const Category = mongoose.model("Category", categorySchema);

const bookSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true
        },
        author: {
            type: String,
            required: true,
            trim: true
        },
        isbn: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: true
        },
        publishedYear: {
            type: Number,
            min: 0
        },
        stock: {
            type: Number,
            default: 0,
            min: 0
        },
        description: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true,
        collection: "Books"
    }
);

bookSchema.index({ isbn: 1 }, { unique: true });

const Book = mongoose.model("Book", bookSchema);

async function recalculateBookCount(categoryId) {
    if (!categoryId) return;
    const totalBooks = await Book.countDocuments({ category: categoryId });
    await Category.findByIdAndUpdate(categoryId, { bookCount: totalBooks });
}

function normaliseString(value) {
    return typeof value === "string" ? value.trim() : value;
}

// =======================================================
// CATEGORY ROUTES
// =======================================================

app.post("/api/categories", async (req, res) => {
    try {
        const name = normaliseString(req.body.name);
        const description = normaliseString(req.body.description);

        if (!name) {
            return res.status(400).json({ message: "Category name is required." });
        }

        const category = new Category({ name, description });
        await category.save();

        res.status(201).json(category);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "Category name already exists." });
        }
        res.status(400).json({ message: error.message });
    }
});

app.get("/api/categories", async (_req, res) => {
    const categories = await Category.find().sort({ createdAt: -1 });
    res.status(200).json(categories);
});

app.get("/api/categories/:id", async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ message: "Category not found." });
        }
        res.status(200).json(category);
    } catch (error) {
        res.status(400).json({ message: "Invalid category id." });
    }
});

app.put("/api/categories/:id", async (req, res) => {
    try {
        const updates = {};
        if ("name" in req.body) updates.name = normaliseString(req.body.name);
        if ("description" in req.body) updates.description = normaliseString(req.body.description);

        const category = await Category.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true
        });

        if (!category) {
            return res.status(404).json({ message: "Category not found." });
        }

        res.status(200).json({
            message: "Category updated successfully.",
            category
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "Category name already exists." });
        }
        res.status(400).json({ message: error.message });
    }
});

app.delete("/api/categories/:id", async (req, res) => {
    try {
        const categoryId = req.params.id;
        const hasBooks = await Book.exists({ category: categoryId });

        if (hasBooks) {
            return res.status(409).json({
                message: "Cannot delete category while books are still assigned. Reassign or remove them first."
            });
        }

        const deletedCategory = await Category.findByIdAndDelete(categoryId);
        if (!deletedCategory) {
            return res.status(404).json({ message: "Category not found." });
        }

        res.status(200).json({
            message: "Category deleted successfully.",
            category: deletedCategory
        });
    } catch (error) {
        res.status(400).json({ message: "Invalid category id." });
    }
});

// =======================================================
// BOOK ROUTES
// =======================================================

app.post("/api/books", async (req, res) => {
    try {
        const title = normaliseString(req.body.title);
        const author = normaliseString(req.body.author);
        const isbn = normaliseString(req.body.isbn);
        const categoryId = req.body.categoryId || req.body.category;

        if (!title || !author || !isbn || !categoryId) {
            return res.status(400).json({
                message: "title, author, isbn and categoryId are required."
            });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ message: "Category not found." });
        }

        const book = new Book({
            title,
            author,
            isbn,
            category: category._id,
            publishedYear: req.body.publishedYear,
            stock: req.body.stock,
            description: normaliseString(req.body.description)
        });

        await book.save();
        await recalculateBookCount(category._id);

        const populatedBook = await book.populate("category", "name description");

        res.status(201).json(populatedBook);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "ISBN already exists." });
        }
        res.status(400).json({ message: error.message });
    }
});

app.get("/api/books", async (req, res) => {
    const filters = {};
    if (req.query.categoryId) filters.category = req.query.categoryId;
    if (req.query.search) {
        const search = new RegExp(req.query.search, "i");
        filters.$or = [{ title: search }, { author: search }, { isbn: search }];
    }

    const books = await Book.find(filters)
        .sort({ createdAt: -1 })
        .populate("category", "name description");

    res.status(200).json(books);
});

app.get("/api/books/:id", async (req, res) => {
    try {
        const book = await Book.findById(req.params.id).populate("category", "name description");
        if (!book) {
            return res.status(404).json({ message: "Book not found." });
        }
        res.status(200).json(book);
    } catch (error) {
        res.status(400).json({ message: "Invalid book id." });
    }
});

app.put("/api/books/:id", async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);

        if (!book) {
            return res.status(404).json({ message: "Book not found." });
        }

        const previousCategoryId = book.category.toString();
        const updatedFields = {};
        if ("title" in req.body) updatedFields.title = normaliseString(req.body.title);
        if ("author" in req.body) updatedFields.author = normaliseString(req.body.author);
        if ("isbn" in req.body) updatedFields.isbn = normaliseString(req.body.isbn);
        if ("publishedYear" in req.body) updatedFields.publishedYear = req.body.publishedYear;
        if ("stock" in req.body) updatedFields.stock = req.body.stock;
        if ("description" in req.body) updatedFields.description = normaliseString(req.body.description);

        let newCategoryId = book.category;
        const incomingCategory = req.body.categoryId || req.body.category;

        if (incomingCategory && incomingCategory.toString() !== book.category.toString()) {
            const newCategory = await Category.findById(incomingCategory);
            if (!newCategory) {
                return res.status(404).json({ message: "New category not found." });
            }
            newCategoryId = newCategory._id;
        }

        book.set({
            ...updatedFields,
            category: newCategoryId
        });
        await book.save();

        if (incomingCategory && incomingCategory.toString() !== previousCategoryId) {
            await Promise.all([
                recalculateBookCount(newCategoryId),
                recalculateBookCount(previousCategoryId)
            ]);
        } else {
            await recalculateBookCount(newCategoryId);
        }

        const populatedBook = await book.populate("category", "name description");

        res.status(200).json({
            message: "Book updated successfully.",
            book: populatedBook
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "ISBN already exists." });
        }
        res.status(400).json({ message: error.message });
    }
});

app.delete("/api/books/:id", async (req, res) => {
    try {
        const book = await Book.findByIdAndDelete(req.params.id);
        if (!book) {
            return res.status(404).json({ message: "Book not found." });
        }

        await recalculateBookCount(book.category);

        res.status(200).json({
            message: "Book deleted successfully.",
            book
        });
    } catch (error) {
        res.status(400).json({ message: "Invalid book id." });
    }
});

// =======================================================
// GLOBAL ERROR HANDLER FALLBACK
// =======================================================

app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ message: "Internal server error." });
});

// =======================================================
// SERVER START
// =======================================================

app.listen(PORT, () => {
    console.log(`🚀 Library Management API ready at http://localhost:${PORT}`);
});