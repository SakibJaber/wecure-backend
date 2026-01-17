const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

async function debugLatestAppointment() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wecure';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db();
    const collection = db.collection('appointments');

    // Get the most recently created appointment
    const latestAppointment = await collection
      .find()
      .sort({ createdAt: -1 })
      .limit(1)
      .next();

    if (latestAppointment) {
      console.log('Latest Appointment Found:');
      console.log('_id:', latestAppointment._id);
      console.log('createdAt:', latestAppointment.createdAt);
      console.log('doctorId:', latestAppointment.doctorId);
      console.log('doctorId Type:', typeof latestAppointment.doctorId);
      if (
        latestAppointment.doctorId &&
        latestAppointment.doctorId.constructor
      ) {
        console.log(
          'doctorId Constructor:',
          latestAppointment.doctorId.constructor.name,
        );
      }

      // Check if this doctorId matches the one we expect (from previous logs)
      // Expected: 6968879f78dbe211a6ba4029
      const expectedDoctorId = '6968879f78dbe211a6ba4029';
      console.log(
        'Matches expected doctorId (6968879f78dbe211a6ba4029)?',
        latestAppointment.doctorId.toString() === expectedDoctorId,
      );
    } else {
      console.log('No appointments found in the database.');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

debugLatestAppointment();
