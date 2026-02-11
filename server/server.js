import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer"; // Import multer
import fs from "fs";
import chat from "./chat.js";

dotenv.config();
fs.mkdirSync("uploads", { recursive: true });

const app = express();
app.use(cors());

// Configure multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: storage });

const PORT = 5001;

let filePath;

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("No file uploaded.");
    }
    // Use multer to handle file upload
    filePath = req.file.path; // The path where the file is temporarily saved
    return res.send(filePath + " upload successfully.");
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.get("/chat", async (req, res) => {
  try {
    if (!req.query.question) {
      return res.status(400).send("Missing query param: question");
    }
    const resp = await chat(filePath, req.query.question); // Pass the file path to your main function
    return res.send(resp.text);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
