import path from 'path';
import { app } from './server';

const webHome = path.resolve(__dirname, '../../comma-web');

// app.get('/commaweb', (req, res) => {
//   console.log('get comma web');
//   res.sendFile(path.join(webHome, 'index.html'));
// });

app.get('/*', (req, res) => {
  console.log('req.originalUrl:', req.originalUrl);
  const filePath = path.join(webHome, req.originalUrl);
  if (filePath.startsWith(webHome)) {
    console.log('send static file:', filePath);
    res.sendFile(filePath);
  } else {
    console.log('file not exists:', filePath);
    res.status(404);
    res.send('');
  }
});

app.listen(8080);
