const amqp = require('amqplib');

const RABBIT_HOST = process.env.RABBIT_HOST || 'localhost'; 
const RABBIT_USER = process.env.RABBIT_USER || 'root'; 
const RABBIT_PASS = process.env.RABBIT_PASS || 'test'; 
const RABBIT_URL = `amqp://${RABBIT_USER}:${RABBIT_PASS}@${RABBIT_HOST}`;
const DATA_QUEUE = 'device_data_queue'; 

const SIMULATED_DEVICE_ID = parseInt(process.env.SIMULATED_DEVICE_ID || 23); 

let channel;

/**
 * Generează o valoare de măsurătoare bazată pe ora din zi a datei specificate.
 * @param {Date} date - Obiectul Date pentru care se generează măsura.
 */
function generateMeasurement(date) {
    const now = date;
    const hour = now.getHours();
    let consumption;

    if (hour >= 23 || hour < 6) { 
        consumption = 0.05 + Math.random() * 0.1; 
    } else if (hour >= 18 && hour < 23) { 
        consumption = 0.5 + Math.random() * 0.8;
    } else { 
        consumption = 0.1 + Math.random() * 0.4; 
    }
    
    return { 
        timestamp: now.toISOString(), 
        deviceId: SIMULATED_DEVICE_ID, 
        measurement_value: parseFloat(consumption.toFixed(3)) 
    };
}

/**
 * Publică un mesaj în coada RabbitMQ.
 * @param {object} data - Obiectul de date de publicat.
 */
function publishData(data) {
    if (!channel) {
        console.error("Channel not ready. Skipping data send.");
        return;
    }
    channel.sendToQueue(DATA_QUEUE, Buffer.from(JSON.stringify(data)), { persistent: true });
    
    console.log(`[SIMULATOR] Sent data for Device ${data.deviceId}: ${data.measurement_value} kWh at ${data.timestamp}`);
}

function startRealTimeSimulation() {
    console.log("[SIMULATOR] Starting real-time simulation (10-minute intervals).");
    
    publishData(generateMeasurement(new Date()));
//     setInterval(() => {
//         publishData(generateMeasurement(new Date()));
//     }, 10 * 1000 * 1000); 
}

function sendHistoricalData() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7); 
    startDate.setHours(0, 0, 0, 0); 

    console.log(`[SIMULATOR] Starting historical data generation from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    let currentDate = new Date(startDate.getTime());
    let messageCount = 0;
    
    while (currentDate.getTime() < endDate.getTime()) {
        const data = generateMeasurement(currentDate);
        publishData(data);
        
        currentDate.setMinutes(currentDate.getMinutes() + 10);
        messageCount++;
    }
    
    console.log(`[SIMULATOR] Finished historical data generation. Total messages sent: ${messageCount}`);
    
    startRealTimeSimulation();
}

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBIT_URL);
        connection.on("error", (err) => {
            console.error("RabbitMQ Connection Error:", err.message);
        });
        console.log("Connected to RabbitMQ successfully.");
        channel = await connection.createChannel();
        
        await channel.assertQueue(DATA_QUEUE, { durable: true });
        console.log("Simulator connected to RabbitMQ and DATA_QUEUE asserted.");
        
        sendHistoricalData();

    } catch (error) {
        console.error("Failed to connect to RabbitMQ:", error.message);
        console.log("Retrying connection in 5 seconds...");
        setTimeout(connectRabbitMQ, 5000); 
    }
}

connectRabbitMQ();