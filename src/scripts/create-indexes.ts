/**
 * Index Migration Script
 * ----------------------
 * Run this script ONCE on your production MongoDB to create all the indexes
 * that are defined in the Mongoose schemas but NOT auto-created because
 * `autoIndex: false` is set in database.config.ts.
 *
 * Usage (run from project root):
 *   npx ts-node -r tsconfig-paths/register src/scripts/create-indexes.ts
 *
 * Can be run multiple times safely — MongoDB will skip indexes that already exist.
 */

import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

async function createIndexes() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment variables');
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log('✅ Connected to MongoDB\n');

  // ── appointments ──────────────────────────────────────────────────────────
  console.log('Creating indexes on: appointments');
  const appointments = db.collection('appointments');
  await appointments.createIndexes([
    // Unique slot guard (non-cancelled appointments)
    {
      key: { doctorId: 1, appointmentDate: 1, appointmentTime: 1 },
      unique: true,
      partialFilterExpression: { status: { $ne: 'CANCELLED' } },
      name: 'idx_appt_doctor_date_time_unique',
    },
    // Listing queries
    { key: { userId: 1, appointmentDate: -1 }, name: 'idx_appt_user_date' },
    { key: { doctorId: 1, appointmentDate: -1 }, name: 'idx_appt_doctor_date' },
    // Status count queries (getForDoctor, getDashboardStats)
    { key: { doctorId: 1, status: 1 }, name: 'idx_appt_doctor_status' },
    // Admin & scheduler queries
    { key: { status: 1, appointmentDate: -1 }, name: 'idx_appt_status_date' },
    // Payout processing
    { key: { isPaidOut: 1, status: 1 }, name: 'idx_appt_payout_status' },
    // Foreign key lookups
    { key: { specialistId: 1 }, name: 'idx_appt_specialist' },
    { key: { paymentId: 1 }, name: 'idx_appt_payment' },
    { key: { payoutId: 1 }, name: 'idx_appt_payout' },
    // Scheduler reminder queries
    {
      key: { status: 1, appointmentDate: 1, reminder6hSent: 1 },
      name: 'idx_appt_reminder6h',
    },
    {
      key: { status: 1, appointmentDate: 1, reminder1hSent: 1 },
      name: 'idx_appt_reminder1h',
    },
  ]);
  console.log('  ✅ appointments indexes created\n');

  // ── doctors ───────────────────────────────────────────────────────────────
  console.log('Creating indexes on: doctors');
  const doctors = db.collection('doctors');
  await doctors.createIndexes([
    { key: { userId: 1 }, unique: true, name: 'idx_doctor_userId_unique' },
    { key: { specialtyId: 1 }, name: 'idx_doctor_specialtyId' },
    { key: { verificationStatus: 1 }, name: 'idx_doctor_verificationStatus' },
    { key: { isVerified: 1 }, name: 'idx_doctor_isVerified' },
    // Public listing compound (most common filter)
    {
      key: { specialtyId: 1, isVerified: 1 },
      name: 'idx_doctor_specialty_verified',
    },
    {
      key: { userId: 1, verificationStatus: 1 },
      name: 'idx_doctor_userId_verificationStatus',
    },
  ]);
  console.log('  ✅ doctors indexes created\n');

  // ── users ─────────────────────────────────────────────────────────────────
  console.log('Creating indexes on: users');
  const users = db.collection('users');
  await users.createIndexes([
    { key: { email: 1 }, unique: true, name: 'idx_user_email_unique' },
    { key: { role: 1 }, name: 'idx_user_role' },
    { key: { status: 1 }, name: 'idx_user_status' },
  ]);
  console.log('  ✅ users indexes created\n');

  // ── doctoravailabilities ──────────────────────────────────────────────────
  console.log('Creating indexes on: doctoravailabilities');
  const availability = db.collection('doctoravailabilities');
  await availability.createIndexes([
    { key: { doctorId: 1 }, name: 'idx_avail_doctorId' },
    {
      key: { doctorId: 1, dayOfWeek: 1 },
      unique: true,
      name: 'idx_avail_doctor_day_unique',
    },
    { key: { doctorId: 1, isActive: 1 }, name: 'idx_avail_doctor_active' },
  ]);
  console.log('  ✅ doctoravailabilities indexes created\n');

  // ── reviews ───────────────────────────────────────────────────────────────
  console.log('Creating indexes on: reviews');
  const reviews = db.collection('reviews');
  await reviews.createIndexes([
    { key: { doctorId: 1 }, name: 'idx_review_doctorId' },
    { key: { userId: 1 }, name: 'idx_review_userId' },
    { key: { doctorId: 1, rating: 1 }, name: 'idx_review_doctor_rating' },
    { key: { createdAt: -1 }, name: 'idx_review_createdAt_desc' },
  ]);
  console.log('  ✅ reviews indexes created\n');

  // ── doctorexperiences ─────────────────────────────────────────────────────
  console.log('Creating indexes on: doctorexperiences');
  const experiences = db.collection('doctorexperiences');
  await experiences.createIndexes([
    { key: { doctorId: 1 }, name: 'idx_exp_doctorId' },
    // Used in sort within aggregation pipeline
    {
      key: { doctorId: 1, isCurrent: -1, startDate: -1 },
      name: 'idx_exp_doctor_sort',
    },
  ]);
  console.log('  ✅ doctorexperiences indexes created\n');

  // ── doctorservices ────────────────────────────────────────────────────────
  console.log('Creating indexes on: doctorservices');
  const services = db.collection('doctorservices');
  await services.createIndexes([
    { key: { doctorId: 1 }, name: 'idx_svc_doctorId' },
  ]);
  console.log('  ✅ doctorservices indexes created\n');

  // ── auditlogs ─────────────────────────────────────────────────────────────
  console.log('Creating indexes on: auditlogs');
  const auditLogs = db.collection('auditlogs');
  await auditLogs.createIndexes([
    { key: { userId: 1 }, name: 'idx_audit_userId' },
    // TTL index: auto-delete audit logs older than 90 days
    {
      key: { createdAt: 1 },
      expireAfterSeconds: 7776000,
      name: 'idx_audit_ttl_90d',
    },
  ]);
  console.log('  ✅ auditlogs indexes created (with 90-day TTL)\n');

  await mongoose.disconnect();
  console.log('🎉 All indexes created successfully!');
}

createIndexes().catch((err) => {
  console.error('❌ Index creation failed:', err);
  process.exit(1);
});
