import amqp from "amqplib";

async function testRabbitMQConnection() {
  try {
    const url = "amqp://guest:guest@localhost:5672";
    console.log("Attempting to connect to RabbitMQ as guest...");
    console.log("Connection URL:", url);
    
    const connection = await amqp.connect(url, {
      frameMax: 131072
    });
    console.log("Successfully connected to RabbitMQ as guest!");
    
    const channel = await connection.createChannel();
    console.log("Successfully created channel!");
    
    await channel.close();
    await connection.close();
    console.log("Successfully closed connection!");
  } catch (error) {
    console.error("RabbitMQ connection test failed (guest):", error);
  }
}

testRabbitMQConnection(); 