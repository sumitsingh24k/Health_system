import mongoose from "mongoose";

const healthDataSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    workerId: {
      type: String,
      required: true,
      trim: true,
    },
    reporterRole: {
      type: String,
      required: true,
      enum: ["ASHA", "MEDICAL"],
    },
    location: {
      village: {
        type: String,
        required: true,
        trim: true,
      },
      district: {
        type: String,
        required: true,
        trim: true,
      },
      latitude: {
        type: Number,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        min: -180,
        max: 180,
      },
    },
    disease: {
      type: String,
      required: true,
      trim: true,
      default: "GENERAL",
    },
    reportDate: {
      type: Date,
      default: Date.now,
    },
    householdsVisited: {
      type: Number,
      min: 0,
      default: 0,
    },
    newCases: {
      type: Number,
      min: 0,
      required: true,
    },
    criticalCases: {
      type: Number,
      min: 0,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

healthDataSchema.index({ "location.district": 1, "location.village": 1, reportDate: -1 });
healthDataSchema.index({ reportedBy: 1, reportDate: -1 });
healthDataSchema.index({ disease: 1, reportDate: -1 });
healthDataSchema.index({ reporterRole: 1, reportDate: -1 });

export default mongoose.models.HealthData ||
  mongoose.model("HealthData", healthDataSchema);
