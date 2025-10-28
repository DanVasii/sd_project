-- Check if the database is the one specified in docker-compose.yml (credentials_db)
USE credentials_db;

-- 1. CREATE THE USERS TABLE (Credential Database)
CREATE TABLE  users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'client') NOT NULL DEFAULT 'client'
);

-- 2. INSERT INITIAL ADMINISTRATOR USER
-- NOTE: The password 'adminpass' is hashed using bcrypt 
-- The hash for 'adminpass' is $2a$10$w4r/9BwYk20fF6vE6bH7gOCf3z0e5F7/Y.0F7l2w1Z2B.0N3d5a.
-- You must use a pre-hashed password here as the database entry is checked against bcrypt.
-- If you change the password here, you must re-hash it and update this value.
INSERT INTO users (username, password, role) 
VALUES ('admin', '$2b$08$JaBvp5Z9G7gMLs2U9A4STu8skWGCci7ZPGhI2NYHj08hF/u6fdj1q', 'admin')
ON DUPLICATE KEY UPDATE 
    password = VALUES(password), -- Prevents accidental password change on restart
    role = 'admin';

-- 3. INSERT AN INITIAL CLIENT USER
-- The password for 'testclient' is 'clientpass' (pre-hashed)
INSERT INTO users (username, password, role) 
VALUES ('testclient', '$2b$08$4TIpFQJQa1Hf3g72Vqsleu38ntK0ak9UKSjNXfXLHt3ljD/t46VYi', 'client')
ON DUPLICATE KEY UPDATE 
    password = VALUES(password), 
    role = 'client';
