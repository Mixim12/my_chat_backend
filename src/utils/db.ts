import mongoose from "mongoose";

export async function connectDB(mongoUri: string) {
  try {
    await mongoose.connect(mongoUri);
    
  } catch (error) {
    console.error("[MongoDB] Error connecting to MongoDB:", error);
    process.exit(1);
  }
}
