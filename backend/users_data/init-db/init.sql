USE users_data_db;

create table if not exists users (
    user_id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    avatar_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

insert into users (user_id, name, email, avatar_url) values
(1, 'Alice Johnson', 'alice@yahoo.com', 'https://i.pravatar.cc/150?img=1'),
(2, 'Bob Smith', 'bob@yahoo.com', 'https://i.pravatar.cc/150?img=2'),
