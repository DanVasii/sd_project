USE devices_db;

-- Drop existing tables to ensure the new schema is applied correctly on a fresh run.
-- This is common practice for Docker init scripts to guarantee a specific schema state.
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS synced_users;

-- 1. Tabela de Sincronizare Utilizatori (conform cerinței)
-- Aceasta va conține doar ID-urile utilizatorilor sincronizați din User Management Microservice.
CREATE TABLE IF NOT EXISTS synced_users (
    user_id INT NOT NULL PRIMARY KEY
);

-- 2. Tabela de Dispozitive (Device Microservice)
-- user_id a fost modificat să fie NULLABLE pentru a permite dispozitive nealocate.
-- S-a adăugat constraint-ul FOREIGN KEY.
CREATE TABLE IF NOT EXISTS devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    max_consumption FLOAT NOT NULL,
    image_url VARCHAR(512),
    -- Am eliminat NOT NULL de la user_id pentru a permite dispozitive nealocate
    user_id INT, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- FOREIGN KEY: Asigură integritatea datelor, legând dispozitivul de un user_id sincronizat.
    -- ON DELETE SET NULL: Dacă un utilizator este șters (de la nivelul Auth/Users Data), 
    -- dispozitivele alocate lui devin "unassigned" (user_id devine NULL).
    FOREIGN KEY (user_id) REFERENCES synced_users(user_id) ON DELETE SET NULL 
);

-- Popularea inițială a tabelei de utilizatori sincronizați (ID 1 și 2 există în users_data)
INSERT INTO synced_users (user_id) VALUES (1), (2);

-- Popularea inițială a tabelei de dispozitive
INSERT INTO devices (name, max_consumption, image_url, user_id) VALUES
('Smart Meter 1', 10.5, 'https://i.pravatar.cc/150?img=1', 1),
('Smart Meter 2', 5.2, 'https://i.pravatar.cc/150?img=2', 2),
('Smart Meter 3', 8.0, 'https://i.pravatar.cc/150?img=3', NULL);