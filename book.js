const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
const PORT = 8001;

// use json on mongoose
app.use(express.json());
app.use(cors()); // Enable CORS for Angular frontend

app.get('/', (req, res) => {
    res.send("Book Management API running.");
});

// Open Connection Mongoose DB
mongoose
    .connect("mongodb://localhost:27017/sengvengsorng")
    .then(() => console.log("Mongoose Connected!"))
    .catch((err) => console.error("Error Connection", err))


// =======================================================
// BOOK SCHEMA AND MODEL
// =======================================================
const schemaBook = new mongoose.Schema({
    title: { type: String, required: true },
    author: { type: String, required: true },
    isbn: { type: String, required: true, unique: true },
    category: { type: String, required: true }, // Placeholder for category name/ID
    publishedYear: { type: Number },
    stock: { type: Number, required: true, default: 0 },
    description: { type: String },
    created_date: { type: Date, default: Date.now }
});
const Book = mongoose.model("Books", schemaBook);


// =======================================================
// BOOK CRUD ENDPOINTS
// =======================================================

// 1. Create Book using method POST
app.post("/api/books", async (req, res) => {
    try {
        const book = new Book(req.body);
        await book.save();
        res.status(201).json(book)
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 2. List all books using method GET
app.get("/api/books", async (req, res) => {
    const books = await Book.find().sort({ created_date: -1 });
    res.status(200).json(books);
});

// 3. Get book by ID using method GET
app.get("/api/books/:id", async (req, res) => {
    try {
        const bookId = req.params.id;
        const book = await Book.findById(bookId);

        if (!book) {
            return res.status(404).json({ message: "Book not found" });
        }

        res.status(200).json(book);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// 4. Update book using method PUT
app.put("/api/books/:id", async (req, res) => {
    try {
        const bookId = req.params.id;

        const updatedBook = await Book.findOneAndUpdate(
            { _id: bookId },
            req.body,
            { new: true, runValidators: true } 
        );

        if (!updatedBook) {
            return res.status(404).json({ message: "Book not found" });
        }

        res.status(200).json({
            message: "Book updated successfully",
            book: updatedBook
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

// 5. Delete book using method DELETE
app.delete("/api/books/:id", async (req, res) => {
    try {
        const bookId = req.params.id;
        const deletedBook = await Book.findByIdAndDelete(bookId);

        if (!deletedBook) {
            return res.status(404).json({ message: "Book not found" });
        }
        
        res.status(200).json({
            message: "Book deleted successfully",
            book: deletedBook
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});


// startup node project
app.listen(PORT, () => {
    console.log(`Server is running
        http://localhost:${PORT}`);
});