const crypto = require("crypto");

// Secret key (خليها محفوظة كويس ومتشاركهاش مع حد)
const secretKey = "your-very-secure-secret-key";

// دالة لعمل الهاش
function hashPassword(password) {
  return crypto
    .createHmac("sha256", secretKey) // ممكن تغير sha256 لـ sha512 مثلاً
    .update(password)
    .digest("hex");
}

// مثال
const password = "mySecurePassword123";
const hashedPassword = hashPassword(password);

console.log("Original Password:", password);
console.log("Hashed Password:", hashedPassword);
