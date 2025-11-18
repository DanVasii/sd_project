USE monitoring_db;

-- Tabela pentru stocarea consumului de energie orar
CREATE TABLE IF NOT EXISTS hourly_consumption (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL,
    -- Timestamp-ul marchează începutul orei de agregare (ex: 2025-11-17 22:00:00)
    timestamp DATETIME NOT NULL, 
    energy_consumed FLOAT NOT NULL,
    -- Asigură că nu putem avea două înregistrări pentru același dispozitiv și aceeași oră
    UNIQUE KEY device_hour (device_id, timestamp),
    add FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
);

create table if not exists devices(
    device_id int not null PRIMARY KEY
);

insert into devices (device_id) values
(1),
(2),
(3)