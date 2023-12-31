import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import Joi from 'joi';
import dayjs from 'dayjs';
import { stripHtml } from 'string-strip-html';

const app = express();
app.use(cors());
app.use(express.json());
dotenv.config();
dayjs();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
  await mongoClient.connect();
  console.log('MongoDB connected!');
  db = mongoClient.db();
} catch (err) {
  console.log(err.message);
}

app.post('/participants', async (req, res) => {
  let { name } = req.body;

  if(!name) return res.sendStatus(422);

  if(name){
    name = stripHtml(name.toString()).result.trim();
  }

  if(name === "") return res.sendStatus(422);

  const participantsSchema = Joi.object({
    name: Joi.string().min(1).required()
  })

  const validation = participantsSchema.validate(req.body, { abortEarly: false });

  if (validation.error) {
    const errors = validation.error.details.map(detail => detail.message);
    return res.status(422).send(errors);
  }

  try {
    const participant = await db.collection('participants').findOne({ name });
    if (participant) {
      return res.status(409).send('Já existe um participante com esse nome!');
    }

    await db.collection('participants').insertOne({
      name,
      lastStatus: Date.now(),
    });

    await db.collection('messages').insertOne({
      from: name,
      to: 'Todos',
      text: 'entra na sala...',
      type: 'status',
      time: dayjs().format('HH:mm:ss'),
    });

    res.sendStatus(201);
  } catch (err) {
    console.log(err.message);
    res.status(500).send();
  }
})
    
app.get('/participants', async (req, res) => {
  try {
    const participants = await db.collection('participants').find().toArray();
    res.send(participants);
  } catch (err) {
    res.status(500).send(err.message);
  }
})

app.post('/messages', async (req, res) => {
  const { to, text, type } = req.body;
  const from = req.headers.user;

  try {
    const userExists = await db.collection('participants').findOne({ name: from });

    if(!userExists) return res.sendStatus(422);
  } catch (err) {
    return res.status(500).send(err.message);
  }

  const messagesSchema = Joi.object({
    to: Joi.string().min(1).required(),
    text: Joi.string().min(1).required(),
    type: Joi.string().valid('message', 'private_message').required()
  })

  const validation = messagesSchema.validate(req.body, { abortEarly: false });
  if(validation.error){
    const errors = validation.error.details.map(detail => detail.message);
    return res.status(422).send(errors);
  }

  const sanitizedTo = stripHtml(to).result.trim();
  const sanitizedText = stripHtml(text).result.trim();
  const sanitizedType = stripHtml(type).result.trim();

  const newMessage = {
    from,
    to: sanitizedTo,
    text: sanitizedText,
    type: sanitizedType,
    time: dayjs().format('HH:mm:ss'),
  };

  try {
    await db.collection('messages').insertOne(newMessage);
    res.sendStatus(201);
  } catch (err) {
    res.sendStatus(422).send(err.message);
  }

})

app.get('/messages', async (req, res) => {
  const user = req.headers.user;
  const { limit } = req.query;

  try {
    let query = {
      $or: [
        { type: 'message' },
        { from: 'Todos' },
        { to: user },
        { to: 'Todos' },
        { from: user }
      ]
    };

    let messages = await db.collection('messages').find(query).toArray();

    if (limit) {
      const limitNumber = parseInt(limit);
      if (isNaN(limitNumber) || limitNumber <= 0) {
        return res.status(422).send('Limit deve ser um número inteiro positivo!');
      }
      messages = messages.slice(-limitNumber);
    }

    res.send(messages);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/status', async (req, res) => {
  const user = req.headers.user;

  const participant = await db.collection('participants').findOne({ name: user });
    
  if(!participant) return res.sendStatus(404);
  
  try {
    await db.collection('participants')
      .updateOne({ name: user }, { $set: { lastStatus: Date.now() } })
      
      res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
})

app.delete('/messages/:id', async (req, res) => {
  const user = req.headers.user;
  const { id } = req.params;

  try {
    const message = await db.collection('messages').findOne({ _id: new ObjectId(id) });

    if (!message) {
      return res.sendStatus(404);
    }

    if (message.from !== user) {
      return res.sendStatus(401);
    }

    await db.collection('messages').deleteOne({ _id: new ObjectId(id) });

    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.put('/messages/:id', async (req, res) => {
  const user = req.headers.user;
  const { id } = req.params;
  const { to, text, type } = req.body;

  const messagesSchema = Joi.object({
    to: Joi.string().min(1).required(),
    text: Joi.string().min(1).required(),
    type: Joi.string().valid('message', 'private_message').required()
  });

  const validation = messagesSchema.validate(req.body, { abortEarly: false });
  if (validation.error) {
    const errors = validation.error.details.map(detail => detail.message);
    return res.status(422).send(errors);
  }

  try {
    const message = await db.collection('messages').findOne({ _id: new ObjectId(id) });

    if (!message) {
      return res.sendStatus(404);
    }

    if (message.from !== user) {
      return res.sendStatus(401);
    }

    await db.collection('messages').updateOne({ _id: new ObjectId(id) }, { $set: to, text, type });

    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


async function removeInactiveParticipants() {
  const tenSecondsAgo = Date.now() - 10000;

  try {
    const inactiveUsers = await db.collection('participants').find({lastStatus: { $lt: tenSecondsAgo }}).toArray();

    inactiveUsers.forEach(async (user) => {
      await db.collection('messages').insertOne({
        from: user.name,
        to: 'Todos',
        text: 'sai da sala...',
        type: 'status',
        time: dayjs().format('HH:mm:ss'),
      });
      await db.collection('participants').deleteOne({ name: user.name });
    });
    console.log('Inativos removidos!');
  } catch (err) {
    console.log(err.message);
  }
}

setInterval(removeInactiveParticipants, 15000);

const PORT = 5000;
app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
