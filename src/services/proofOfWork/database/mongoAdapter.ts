import { powGenerated, IPowGenerated} from "../../../models/powModel";

const MongoAdapter = {
  async getLastGeneratedByUserIdentifier(userIdentifier: string): Promise<IPowGenerated | null> {
    return await powGenerated.findOne({ userIdentifier }).sort({ createdAt: -1 }).exec();
  },

  async saveGenerated(data: IPowGenerated): Promise<void> {
    const doc = new powGenerated(data);
    await doc.save();
  },
};

export default MongoAdapter;
