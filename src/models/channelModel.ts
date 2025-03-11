import { Schema, model, Document } from "mongoose";

export interface IChannel extends Document {
  name: string;
  description?: string;
}

const ChannelSchema = new Schema<IChannel>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
  },
  { timestamps: true }
);

export const Channel = model<IChannel>("Channel", ChannelSchema);
