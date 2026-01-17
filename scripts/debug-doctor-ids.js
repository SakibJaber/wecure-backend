const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs');
require('dotenv').config();

async function debugDoctorIds() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/wecure';
  const client = new MongoClient(uri);

  const id1 = '696472aa51ce4bd422d0e5e9'; // From Availability Data
  const id2 = '6968879f78dbe211a6ba4029'; // From Booking Request

  let output = '';
  const log = (msg) => {
    console.log(msg);
    output += msg + '\n';
  };

  try {
    await client.connect();
    log('Connected to MongoDB');
    const db = client.db();
    const doctors = db.collection('doctors');
    const availabilities = db.collection('doctoravailabilities');

    log(`\n--- Checking ID 1: ${id1} (From Availability) ---`);
    const doc1 = await doctors.findOne({ _id: new ObjectId(id1) });
    log('As Doctor Profile ID: ' + (doc1 ? 'FOUND' : 'NOT FOUND'));
    if (doc1) log('  -> userId: ' + doc1.userId);

    const docUser1 = await doctors.findOne({ userId: new ObjectId(id1) });
    log('As Doctor User ID: ' + (docUser1 ? 'FOUND' : 'NOT FOUND'));
    if (docUser1) log('  -> profileId: ' + docUser1._id);

    const avail1 = await availabilities.find({ doctorId: new ObjectId(id1) }).toArray();
    log(`Availability count for doctorId=${id1}: ` + avail1.length);


    log(`\n--- Checking ID 2: ${id2} (From Booking) ---`);
    const doc2 = await doctors.findOne({ _id: new ObjectId(id2) });
    log('As Doctor Profile ID: ' + (doc2 ? 'FOUND' : 'NOT FOUND'));
    if (doc2) log('  -> userId: ' + doc2.userId);

    const docUser2 = await doctors.findOne({ userId: new ObjectId(id2) });
    log('As Doctor User ID: ' + (docUser2 ? 'FOUND' : 'NOT FOUND'));
    if (docUser2) log('  -> profileId: ' + docUser2._id);

    const avail2 = await availabilities.find({ doctorId: new ObjectId(id2) }).toArray();
    log(`Availability count for doctorId=${id2}: ` + avail2.length);

    fs.writeFileSync('debug-output.txt', output);
    console.log('Output written to debug-output.txt');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

debugDoctorIds();
