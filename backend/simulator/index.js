const amqp = require('amqplib');

// Configurarea RabbitMQ. Ne conectăm la 'localhost' deoarece rulează local, 
// iar portul 5672 este expus din Docker.
const RABBIT_HOST = process.env.RABBIT_HOST || 'localhost'; 
const RABBIT_USER = process.env.RABBIT_USER || 'root'; 
const RABBIT_PASS = process.env.RABBIT_PASS || 'test'; 
const RABBIT_URL = `amqp://${RABBIT_USER}:${RABBIT_PASS}@${RABBIT_HOST}`;
const DATA_QUEUE = 'device_data_queue'; 

// ID-ul dispozitivului simulat (poate fi setat prin variabilă de mediu)
const SIMULATED_DEVICE_ID = parseInt(process.env.SIMULATED_DEVICE_ID || 1); 

let channel;

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBIT_URL);
        connection.on("error", (err) => {
            console.error("RabbitMQ Connection Error:", err.message);
        });
        console.log("Connected to RabbitMQ successfully.");
        return ;
        channel = await connection.createChannel();
        // Asigurăm că există coada de date, durabilă
        await channel.assertQueue(DATA_QUEUE, { durable: true });
        console.log("Simulator connected to RabbitMQ and DATA_QUEUE asserted.");
        
        // Începe trimiterea datelor la fiecare 10 minute (600,000 ms)
        sendData();
        setInterval(sendData, 600000); 

    } catch (error) {
        // Dacă eroarea este ECONNREFUSED, containerul Docker nu e gata sau nu e pornit.
        console.error("Failed to connect to RabbitMQ:", error.message);
        console.log("Retrying connection in 5 seconds...");
        setTimeout(connectRabbitMQ, 5000); 
    }
}

function generateMeasurement() {
    // Logica de simulare, imitând consumul real (mai mic noaptea, mai mare seara)
    const now = new Date();
    const hour = now.getHours();
    let consumption;

    if (hour >= 23 || hour < 6) { 
        consumption = 0.05 + Math.random() * 0.1; // Consum redus
    } else if (hour >= 18 && hour < 23) { 
        consumption = 0.5 + Math.random() * 0.8; // Vârf de consum
    } else { 
        consumption = 0.1 + Math.random() * 0.4; // Consum normal ziua
    }
    
    return { 
        timestamp: now.toISOString(), 
        deviceId: SIMULATED_DEVICE_ID, 
        measurement_value: parseFloat(consumption.toFixed(3)) 
    };
}

function sendData() {
    if (!channel) {
        console.error("Channel not ready. Skipping data send.");
        return;
    }
    const data = generateMeasurement();
    
    // Publică mesajul în coadă (persistent)
    channel.sendToQueue(DATA_QUEUE, Buffer.from(JSON.stringify(data)), { persistent: true });
    
    console.log(`[SIMULATOR] Sent data for Device ${data.deviceId}: ${data.measurement_value} kWh at ${data.timestamp}`);
}

connectRabbitMQ();