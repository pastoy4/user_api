const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sengvengsorng';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    // Exit process on connection failure
    process.exit(1); 
  });

// --- MONGOOSE SCHEMA & MODEL DEFINITION ---

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: [true, 'First name is required.'],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required.'],
        trim: true
    },
    userName: {
        type: String,
        required: [true, 'Username is required.'],
        unique: true, // Ensures no duplicate usernames
        trim: true
    },
    image:{
        type: String,
        required: [true, 'Image is required.']
    },
    dob: {
        type: Date,
        required: [true, 'Date of Birth is required.']
    },
    gender: {
        type: String,
        required: [true, 'Gender is required.'],
        enum: ['Male', 'Female', 'Other'] // Restrict gender to specific values
    },
    email: {
        type: String,
        required: [true, 'Email is required.'],
        unique: true, // Ensures no duplicate emails
        lowercase: true,
        trim: true,
        match: [/.+@.+\..+/, 'Please enter a valid email address.']
    },
    password: {
        type: String,
        required: [true, 'Password is required.'],
        minlength: [6, 'Password must be at least 6 characters long.']
    },
    // <--- MODIFICATION 1: ADD ROLE NAME TO SCHEMA --->
    roleName: { 
        type: String,
        required: [true, 'Role name is required.'],
        enum: ['admin', 'user', 'moderator'], 
        default: 'user'
    }
    // <--- END MODIFICATION 1 --->
}, { 
    timestamps: true // Adds createdAt and updatedAt fields
});

const User = mongoose.model('user', userSchema);


// --- API ROUTES ---

// Default route for testing server status
app.get('/', (req, res) => {
    res.send('Welcome to the User API! Use /api/users/register for POST requests.');
});

// GET all users (For testing purposes)
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-password -__v'); // Exclude sensitive/unnecessary fields
        res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


// POST route to register a new user
app.post('/api/users/register', async (req, res) => {
    // 1. Destructure data from the request body
    const { 
        firstName, 
        lastName, 
        userName,
        image, 
        dob, 
        gender, 
        email, 
        password, 
        confirmPassword,
        // <--- MODIFICATION 2: ADD ROLE NAME TO DESTRUCTURING --->
        roleName 
        // <--- END MODIFICATION 2 --->
    } = req.body;

    // 2. Basic Validation (checking if passwords match)
    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Password and Confirm Password do not match.' });
    }

    try {
        // 3. Check if user already exists (by email or username)
        const existingUser = await User.findOne({ $or: [{ email }, { userName }] });
        if (existingUser) {
            return res.status(409).json({ message: 'User with that email or username already exists.' });
        }

        // 4. Securely Hash the Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 5. Create a new user instance
        const newUser = new User({
            firstName,
            lastName,
            userName,
            image,
            dob,
            gender,
            email,
            // <--- MODIFICATION 3: ADD ROLE NAME TO NEW USER INSTANCE --->
            roleName,
            // Store the HASHED password
            password: hashedPassword 
        });

        // 6. Save the user to the database
        const savedUser = await newUser.save();

        // 7. Send a successful response (excluding the password hash)
        res.status(201).json({
            message: 'User registered successfully!',
            user: {
                id: savedUser._id,
                userName: savedUser.userName,
                email: savedUser.email
            }
        });

    } catch (error) {
        // Handle validation errors (e.g., required fields missing) or other MongoDB errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ message: messages.join(', ') });
        }
        
        console.error('Error during user registration:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});


// --- SERVER LISTENING ---
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});