import nodemailer from 'nodemailer';

export default function (app) {
  app.post('/email', async (req, res) => {
    const { message: emailMessage } = req.body;
    const senderEmail = process.env.EMAIL_USER;
    const senderPassword = process.env.EMAIL_PASSWORD;
    const recipientEmail = 'maxheadbox@simone.computer';

    if (!senderEmail || !senderPassword) {
      return res.status(500).send('Error: Server environment variables (EMAIL_USER, EMAIL_PASSWORD) are not set.');
    }

    const transporter = nodemailer.createTransport({
      host: 'mail.privateemail.com',
      port: 587,
      secure: false,
      auth: { user: senderEmail, pass: senderPassword },
    });

    try {
      await transporter.sendMail({
        from: `Max Headbox <${senderEmail}>`,
        to: recipientEmail,
        subject: 'New Message from Max Headbox',
        text: `Max Headbox says:\n\n${emailMessage}`,
      });
      res.json({ message: `Email sent successfully to ${recipientEmail}!` });
    } catch (err) {
      res.status(500).send(`Failed to send email. Error: ${err.message}`);
    }
  });
}
