const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
const PORT = 9000;

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
    res.send("Category Management API running.");
});

mongoose
    .connect("mongodb://localhost:27017/sengvengsorng")
    .then(() => console.log("Mongoose Connected!"))
    .catch((err) => console.error("Error Connection", err))

const schemaCategory = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // The category name
    bookCount: { type: Number, default: 0 }, // Total books in this category
    description: { type: String },
    created_date: { type: Date, default: Date.now }
});

const Category = mongoose.model("categorysv1112", schemaCategory);

// =======================================================
// CATEGORY CRUD ENDPOINTS
// =======================================================

// 1. Create Category using method POST
app.post("/api/categories", async (req, res) => {
    try {
        const category = new Category(req.body);
        await category.save();
        res.status(201).json(category)
    } catch (err) {
        // status 400 for bad request (e.g., missing 'name' or name not unique)
        res.status(400).json({ message: err.message });
    }
});

// 2. List all categories using method GET
app.get("/api/categories", async (req, res) => {
    const categories = await Category.find().sort({ created_date: -1 });
    // Use .find() without filtering to return all
    res.status(200).json(categories);
});

// 3. Get category by ID using method GET
app.get("/api/categories/:id", async (req, res) => {
    try {
        const categoryId = req.params.id; // get ID from URL
        const category = await Category.findById(categoryId); // find category by ID

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// 4. Update category using method PUT
app.put("/api/categories/:id", async (req, res) => {
    try {
        const categoryId = req.params.id;

        // Find and update category
        const updatedCategory = await Category.findOneAndUpdate(
            { _id: categoryId },
            req.body,
            { new: true, runValidators: true } // return updated product & validate
        );

        if (!updatedCategory) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json({
            message: "Category updated successfully",
            category: updatedCategory
        });
    } catch (error) {
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});

// 5. Delete category using method DELETE (Added for full CRUD)
app.delete("/api/categories/:id", async (req, res) => {
    try {
        const categoryId = req.params.id;
        const deletedCategory = await Category.findByIdAndDelete(categoryId);

        if (!deletedCategory) {
            return res.status(404).json({ message: "Category not found" });
        }

        res.status(200).json({
            message: "Category deleted successfully",
            category: deletedCategory
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