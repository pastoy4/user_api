const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const Minio = require('minio');
const multer = require('multer');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 9000;

app.use(cors());
app.use(express.json());

 

// --- SWAGGER SETUP ---
const swaggerOptions = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'User API',
			version: '1.0.0',
			description: 'API docs for users and MinIO image upload'
		},
		servers: [{ url: `http://localhost:${port}` }]
	},
	apis: ['./user.js']
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- DATABASE CONNECTION ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sengvengsorng';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Successfully connected to MongoDB.'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    // Exit process on connection failure
    process.exit(1); 
  });

// --- MINIO CONFIGURATION (Docker mapped: 9005:9000, console 9001) ---
const minioClient = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9005', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true' || false,
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123'
});

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'test';

// Lightweight info log (no secrets)
console.log('MinIO config:', {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9005', 10),
    useSSL: process.env.MINIO_USE_SSL === 'true' || false,
    bucket: MINIO_BUCKET
});

// --- MULTER (memory storage) ---
const uploadStorage = multer.memoryStorage();
const upload = multer({
    storage: uploadStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
        const mimeOk = allowed.test(file.mimetype);
        if (extOk && mimeOk) return cb(null, true);
        return cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
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

/**
 * @swagger
 * /:
 *   get:
 *     summary: Welcome message
 *     tags: [General]
 *     responses:
 *       200:
 *         description: Welcome message
 */
app.get('/', (req, res) => {
    res.send('Welcome to the User API! Use /api/users/register for POST requests.');
});

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of all users
 */
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().select('-password -__v'); // Exclude sensitive/unnecessary fields
        res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});


/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firstName, lastName, userName, image, dob, gender, email, password, confirmPassword, roleName]
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               userName: { type: string }
 *               image: { type: string }
 *               dob: { type: string, format: date }
 *               gender: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               confirmPassword: { type: string }
 *               roleName: { type: string }
 *     responses:
 *       201:
 *         description: Created
 */
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

// --- IMAGE UPLOAD ENDPOINT (MinIO) ---
/**
 * @swagger
 * /api/upload/image:
 *   post:
 *     summary: Upload an image to MinIO
 *     tags: [Upload]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *       400:
 *         description: No image file provided
 *       500:
 *         description: Error uploading image
 */
app.post('/api/upload/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided.' });
        }

        const ext = path.extname(req.file.originalname).toLowerCase();
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const objectName = `uploads/${fileName}`;

        await minioClient.putObject(
            MINIO_BUCKET,
            objectName,
            req.file.buffer,
            req.file.size,
            { 'Content-Type': req.file.mimetype }
        );

        const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
        const host = process.env.MINIO_ENDPOINT || 'localhost';
        const port = parseInt(process.env.MINIO_PORT || '9005', 10);
        const publicBase = process.env.MINIO_PUBLIC_URL;
        const directUrl = publicBase
            ? `${publicBase}/${MINIO_BUCKET}/${objectName}`
            : `${protocol}://${host}:${port}/${MINIO_BUCKET}/${objectName}`;

        // Generate a presigned URL (default: 7 days) to bypass AccessDenied without making bucket public
        const expirySeconds = parseInt(process.env.MINIO_PRESIGNED_EXPIRY || '604800', 10); // 7 days
        const presignedUrl = await minioClient.presignedGetObject(MINIO_BUCKET, objectName, expirySeconds);

        return res.status(200).json({
            message: 'Image uploaded successfully.',
            imageUrl: presignedUrl,
            directUrl,
            fileName: objectName
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        return res.status(500).json({ message: 'Error uploading image.', error: error.message });
    }
});

/**
 * @swagger
 * /minio/info:
 *   get:
 *     summary: MinIO configuration info (non-sensitive)
 *     tags: [MinIO]
 *     responses:
 *       200:
 *         description: Current MinIO config
 */
app.get('/minio/info', (req, res) => {
	res.status(200).json({
		endPoint: process.env.MINIO_ENDPOINT || 'localhost',
		port: parseInt(process.env.MINIO_PORT || '9005', 10),
		useSSL: process.env.MINIO_USE_SSL === 'true' || false,
		bucket: MINIO_BUCKET
	});
});

/**
 * @swagger
 * /minio/check:
 *   get:
 *     summary: Connectivity check to MinIO
 *     tags: [MinIO]
 *     responses:
 *       200:
 *         description: OK
 *       500:
 *         description: Not OK
 */
app.get('/minio/check', async (req, res) => {
	try {
		const buckets = await minioClient.listBuckets();
		res.status(200).json({ ok: true, buckets: buckets.map(b => b.name) });
	} catch (error) {
		res.status(500).json({ ok: false, message: error.message, code: error.code });
	}
});

/**
 * @swagger
 * /minio/setup:
 *   post:
 *     summary: Ensure MinIO bucket exists (idempotent)
 *     tags: [MinIO]
 *     responses:
 *       200:
 *         description: Bucket exists
 *       201:
 *         description: Bucket created
 *       500:
 *         description: Error
 */
app.post('/minio/setup', async (req, res) => {
	try {
		const exists = await minioClient.bucketExists(MINIO_BUCKET);
		if (!exists) {
			await minioClient.makeBucket(MINIO_BUCKET);
			return res.status(201).json({ message: `Bucket '${MINIO_BUCKET}' created.` });
		}
		res.status(200).json({ message: `Bucket '${MINIO_BUCKET}' already exists.` });
	} catch (error) {
		console.error('Bucket setup error:', error);
		res.status(500).json({ message: 'Bucket setup failed.', error: error.message });
	}
});


// --- SERVER LISTENING ---
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});