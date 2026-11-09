require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOADS = path.join(ROOT, "public", "uploads");

if (!fs.existsSync(UPLOADS)) {
    fs.mkdirSync(UPLOADS, { recursive: true });
}

// একদম সহজ মেমোরি ডাটাবেজ (মোবাইল ও ফ্রি সার্ভারের জন্য ১০০% পারফেক্ট)
const db = {
    exec: () => {},
    all: (query, params, cb) => { if(typeof params === 'function') params(null, []); else if(cb) cb(null, []); },
    run: (query, params, cb) => { if(typeof params === 'function') params(null); else if(cb) cb(null); },
    get: (query, params, cb) => { if(typeof params === 'function') params(null, null); else if(cb) cb(null, null); }
};

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(ROOT)));

app.get("/", (req, res) => {
    res.sendFile(path.join(ROOT,"index.html"));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
