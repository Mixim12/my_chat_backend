import { Schema, model, Document } from "mongoose";

export interface IPowGenerated extends Document {
  userIdentifier: string;
  challenge: string;
  difficulty: number;
  complexity: number;
  createdAt: number;
  expiresOn: number;
  source?: string;
}

const powGeneratedSchema = new Schema<IPowGenerated>({
  userIdentifier: { type: String, required: true },
  challenge: { type: String, required: true },
  difficulty: { type: Number, default: 4 },
  complexity: { type: Number, default: 4 },
  createdAt: { type: Number, required: true },
  expiresOn: { type: Number, required: true },
  source: { type: String },
});

powGeneratedSchema.index({ userIdentifier: 1, createdAt: 1 });
powGeneratedSchema.index({ expiresOn: 1 }, { expireAfterSeconds: 1 });



export const powGenerated = model<IPowGenerated>("powGenerated", powGeneratedSchema);

