import mongoose from "mongoose";

export async function connectDB(mongoUri: string) {
  try {
    await mongoose.connect(mongoUri);
    console.info("Connected to MongoDB");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
}
