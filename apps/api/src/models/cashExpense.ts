import mongoose from 'mongoose';
const { Schema } = mongoose;

const cashExpenseSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, maxlength: 128, immutable: true },
  payeeName: { type: String, trim: true, maxlength: 160, immutable: true },
  description: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
  expenseAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  expenseAccountName: { type: String, required: true, maxlength: 160, immutable: true },
  cashAccountId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  cashAccountName: { type: String, required: true, maxlength: 160, immutable: true },
  amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  paidAt: { type: Date, required: true, immutable: true },
  journalId: { type: Schema.Types.ObjectId, required: true, ref: 'Journal', immutable: true },
}, { timestamps: true, strict: 'throw', versionKey: false });

const rejectMutation = () => { throw new Error('Posted cash expenses are immutable'); };
cashExpenseSchema.pre('save', function () { if (!this.isNew) rejectMutation(); });
cashExpenseSchema.pre('updateOne', rejectMutation); cashExpenseSchema.pre('updateMany', rejectMutation);
cashExpenseSchema.pre('findOneAndUpdate', rejectMutation); cashExpenseSchema.pre('replaceOne', rejectMutation);
cashExpenseSchema.pre('findOneAndReplace', rejectMutation); cashExpenseSchema.pre('deleteOne', { document: true, query: true }, rejectMutation);
cashExpenseSchema.pre('deleteMany', rejectMutation); cashExpenseSchema.pre('findOneAndDelete', rejectMutation); cashExpenseSchema.pre('bulkWrite', rejectMutation);
cashExpenseSchema.index({ organizationId: 1, idempotencyKey: 1 }, { unique: true });
cashExpenseSchema.index({ organizationId: 1, _id: -1 });

export const CashExpenseModel = mongoose.models.CashExpense || mongoose.model('CashExpense', cashExpenseSchema);
