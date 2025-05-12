import { powGenerated, powUsed, IPowGenerated, IPowUsed } from "../../../models/powModel";
import { Schema } from "mongoose";

const MongoAdapter = {
  async getLastGeneratedByUserIdentifier(userIdentifier: string): Promise<IPowGenerated | null> {
    return await powGenerated.findOne({ userIdentifier }).sort({ createdAt: -1 }).exec();
  },

  async saveGenerated(data: IPowGenerated): Promise<void> {
    const doc = new powGenerated(data);
    await doc.save();
  },

  async getUsed(_id: Schema.Types.ObjectId): Promise<IPowUsed | null> {
    return await powUsed.findOne({ _id }).exec();
  },
  async markChallengeUsed(_id: Schema.Types.ObjectId): Promise<void> {
    const doc = await powGenerated.findOne({ _id }).exec();
    if (doc) {
      await powUsed.create(doc);
      await doc.deleteOne();
    }
  },
};

export default MongoAdapter;
