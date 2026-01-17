const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

async function debugDoctorAppointments() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wecure';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db();
    const collection = db.collection('appointments');

    const doctorIdStr = '6968879f78dbe211a6ba4029';
    const doctorIdObj = new ObjectId(doctorIdStr);

    // Count with string ID
    const countString = await collection.countDocuments({
      doctorId: doctorIdStr,
    });
    console.log(`Appointments with doctorId (String): ${countString}`);

    // Count with ObjectId
    const countObjectId = await collection.countDocuments({
      doctorId: doctorIdObj,
    });
    console.log(`Appointments with doctorId (ObjectId): ${countObjectId}`);

    // List all appointments for this doctor
    const appointments = await collection
      .find({ doctorId: doctorIdObj })
      .toArray();
    console.log(`Found ${appointments.length} appointments (ObjectId query):`);
    appointments.forEach((apt) => {
      console.log(
        `- _id: ${apt._id}, doctorId type: ${typeof apt.doctorId}, constructor: ${apt.doctorId.constructor.name}`,
      );
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

debugDoctorAppointments();
