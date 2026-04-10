import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      enum: ["ADMIN", "ASHA", "HOSPITAL", "MEDICAL"],
    },
    workerId: {
      type: String,
      unique: true,
      sparse: true,
      validate: {
        validator(value) {
          if (this.role !== "ASHA") {
            return !value;
          }

          return /^ASHA_\d+$/.test(value || "");
        },
        message: "workerId is required only for ASHA and must look like ASHA_001",
      },
    },
    location: {
      village: {
        type: String,
        trim: true,
      },
      district: {
        type: String,
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
    status: {
      type: String,
      enum: ["PENDING", "APPROVED"],
      default() {
        return this.role === "HOSPITAL" || this.role === "MEDICAL"
          ? "PENDING"
          : "APPROVED";
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.models.User || mongoose.model("User", userSchema);
