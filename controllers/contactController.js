const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');
const { validationResult } = require('express-validator');

const sendContactEmail = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Please check your input and try again.',
        errors: errors.array()
      });
    }

    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required.',
        errors: [
          { field: 'general', message: 'Please fill in all required fields.' }
        ]
      });
    }

    // Check email service configurations
    const hasSendGrid = !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL);
    const hasGmail = !!(process.env.MAIL_USER && process.env.MAIL_PASS);

    // Determine recipient email
    const recipientEmail = process.env.CONTACT_EMAIL || process.env.SENDGRID_FROM_EMAIL || process.env.MAIL_USER || 'shubhammeena1207@gmail.com';

    // Track service attempts
    let sendGridAttempted = false;
    let sendGridError = null;
    let gmailAttempted = false;
    let gmailError = null;
    let successfulService = null;
    let mainEmailResponse = null;

    // Try SendGrid API first if available
    if (hasSendGrid) {
      sendGridAttempted = true;
      try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);

        const mailOptions = {
          to: recipientEmail,
          from: {
            email: process.env.SENDGRID_FROM_EMAIL,
            name: 'Portfolio Contact Form'
          },
          replyTo: {
            email: email,
            name: name
          },
          subject: `Portfolio Contact: ${subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
              <div style="background: linear-gradient(135deg, #007AFF 0%, #0051D5 100%); color: white; padding: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 600;">New Contact Message</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">From your portfolio website</p>
              </div>
              
              <div style="padding: 30px;">
                <div style="background-color: #f8fafc; padding: 25px; border-radius: 12px; margin-bottom: 25px; border-left: 4px solid #007AFF;">
                  <h2 style="margin: 0 0 20px 0; color: #1a202c; font-size: 18px;">Contact Details</h2>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; font-weight: 600; color: #4a5568; width: 100px;">Name:</td>
                      <td style="padding: 8px 0; color: #1a202c;">${name}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">Email:</td>
                      <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #007AFF; text-decoration: none;">${email}</a></td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">Subject:</td>
                      <td style="padding: 8px 0; color: #1a202c;">${subject}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">Time:</td>
                      <td style="padding: 8px 0; color: #1a202c;">${new Date().toLocaleString()}</td>
                    </tr>
                  </table>
                </div>
                
                <div style="margin-bottom: 25px;">
                  <h3 style="margin: 0 0 15px 0; color: #1a202c; font-size: 16px;">Message:</h3>
                  <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; line-height: 1.6; color: #2d3748;">
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                  <a href="mailto:${email}?subject=Re: ${encodeURIComponent(subject)}" 
                     style="background-color: #007AFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
                    Reply to ${name}
                  </a>
                </div>
              </div>
              
              <div style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #718096; font-size: 14px;">
                  This message was sent from your portfolio contact form.<br>
                  You can reply directly to this email to respond to ${name}.
                </p>
              </div>
            </div>
          `,
          text: `
New Contact Form Submission

Name: ${name}
Email: ${email}
Subject: ${subject}
Time: ${new Date().toLocaleString()}

Message:
${message}

---
This email was sent from your portfolio contact form.
You can reply directly to this email to respond to ${name}.
          `
        };

        const response = await sgMail.send(mailOptions);
        
        if (response[0].statusCode >= 200 && response[0].statusCode < 300) {
          successfulService = 'SendGrid';
          mainEmailResponse = {
            service: 'SendGrid',
            messageId: response[0].headers['x-message-id'],
            statusCode: response[0].statusCode,
            recipient: recipientEmail,
            timestamp: new Date().toISOString()
          };
        } else {
          throw new Error(`SendGrid returned status code: ${response[0].statusCode}`);
        }
        
      } catch (error) {
        console.error('SendGrid API error:', error);
        sendGridError = error;
        // Continue to try Gmail if available
      }
    }

    // Try Gmail SMTP if SendGrid failed or wasn't available
    if (!successfulService && hasGmail) {
      gmailAttempted = true;
      try {
        const transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS
          },
          tls: {
            rejectUnauthorized: false
          }
        });

        await transporter.verify();

        const mailOptions = {
          from: `"Portfolio Contact" <${process.env.MAIL_USER}>`,
          to: recipientEmail,
          replyTo: `"${name}" <${email}>`,
          subject: `Portfolio Contact: ${subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
              <div style="background: linear-gradient(135deg, #007AFF 0%, #0051D5 100%); color: white; padding: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 600;">New Contact Message</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">From your portfolio website</p>
              </div>
              
              <div style="padding: 30px;">
                <div style="background-color: #f8fafc; padding: 25px; border-radius: 12px; margin-bottom: 25px; border-left: 4px solid #007AFF;">
                  <h2 style="margin: 0 0 20px 0; color: #1a202c; font-size: 18px;">Contact Details</h2>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; font-weight: 600; color: #4a5568; width: 100px;">Name:</td>
                      <td style="padding: 8px 0; color: #1a202c;">${name}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">Email:</td>
                      <td style="padding: 8px 0;"><a href="mailto:${email}" style="color: #007AFF; text-decoration: none;">${email}</a></td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">Subject:</td>
                      <td style="padding: 8px 0; color: #1a202c;">${subject}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; font-weight: 600; color: #4a5568;">Time:</td>
                      <td style="padding: 8px 0; color: #1a202c;">${new Date().toLocaleString()}</td>
                    </tr>
                  </table>
                </div>
                
                <div style="margin-bottom: 25px;">
                  <h3 style="margin: 0 0 15px 0; color: #1a202c; font-size: 16px;">Message:</h3>
                  <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; line-height: 1.6; color: #2d3748;">
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                  <a href="mailto:${email}?subject=Re: ${encodeURIComponent(subject)}" 
                     style="background-color: #007AFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; display: inline-block;">
                    Reply to ${name}
                  </a>
                </div>
              </div>
              
              <div style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #718096; font-size: 14px;">
                  This message was sent from your portfolio contact form.<br>
                  You can reply directly to this email to respond to ${name}.
                </p>
              </div>
            </div>
          `,
          text: `
New Contact Form Submission

Name: ${name}
Email: ${email}
Subject: ${subject}
Time: ${new Date().toLocaleString()}

Message:
${message}

---
This message was sent from your portfolio contact form.
You can reply directly to this email to respond to ${name}.
          `
        };

        const info = await transporter.sendMail(mailOptions);
        
        successfulService = 'Gmail';
        mainEmailResponse = {
          service: 'Gmail SMTP',
          messageId: info.messageId,
          response: info.response,
          recipient: recipientEmail,
          timestamp: new Date().toISOString()
        };
        
      } catch (error) {
        console.error('Gmail SMTP error:', error);
        gmailError = error;
        // Continue to error handling below
      }
    }

    // If main email failed, return error
    if (!successfulService) {
      let errorMessage = 'Failed to send email. Please contact me directly at shubhammeena1207@gmail.com';
      let errorDetails = [];

      // Build comprehensive error message based on what was attempted
      if (!hasSendGrid && !hasGmail) {
        errorMessage = 'Email service is not configured. Please contact me directly at shubhammeena1207@gmail.com';
        errorDetails.push({ field: 'server', message: 'No email service configuration found.' });
      } else {
        // At least one service was configured but failed
        if (sendGridAttempted && sendGridError) {
          errorDetails.push({ 
            field: 'sendgrid', 
            message: `SendGrid failed: ${sendGridError.message || 'Unknown error'}` 
          });
        }
        
        if (gmailAttempted && gmailError) {
          let gmailErrorMsg = 'Gmail SMTP failed';
          
          if (gmailError.code === 'EAUTH') {
            gmailErrorMsg = 'Gmail authentication failed - check app password';
          } else if (gmailError.code === 'ECONNECTION' || gmailError.code === 'ETIMEDOUT') {
            gmailErrorMsg = 'Gmail connection failed - network/firewall issue';
          } else if (gmailError.responseCode === 535) {
            gmailErrorMsg = 'Invalid Gmail credentials';
          } else {
            gmailErrorMsg = `Gmail error: ${gmailError.message || 'Unknown error'}`;
          }
          
          errorDetails.push({ field: 'gmail', message: gmailErrorMsg });
        }
        
        if (!gmailAttempted && !hasGmail && sendGridAttempted) {
          errorDetails.push({ field: 'gmail', message: 'Gmail not configured as fallback' });
        }
      }

      return res.status(500).json({
        success: false,
        message: errorMessage,
        errors: errorDetails,
        debug: {
          sendGridConfigured: hasSendGrid,
          gmailConfigured: hasGmail,
          sendGridAttempted,
          gmailAttempted,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Main email sent successfully, now send auto-reply
    let autoReplyStatus = 'not_attempted';
    let autoReplyError = null;

    try {
      console.log(`Sending auto-reply using ${successfulService}...`);
      
      if (successfulService === 'SendGrid') {
        // Send auto-reply via SendGrid
        const autoReplyOptions = {
          to: email,
          from: {
            email: process.env.SENDGRID_FROM_EMAIL,
            name: 'Shubham Meena'
          },
          subject: `Re: ${subject} - Message Received`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
              <div style="background: linear-gradient(135deg, #007AFF 0%, #0051D5 100%); color: white; padding: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Thank You for Your Message</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Auto-reply from Shubham Meena</p>
              </div>
              
              <div style="padding: 30px;">
                <p style="color: #1a202c; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                  Hi <strong>${name}</strong>,
                </p>
                
                <p style="color: #1a202c; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                  Thanks for reaching out! I've received your message and will get back to you as soon as possible.
                </p>
                
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #007AFF;">
                  <h3 style="margin: 0 0 15px 0; color: #1a202c; font-size: 16px;">Your message:</h3>
                  <div style="color: #4a5568; line-height: 1.6;">
                    <strong>Subject:</strong> ${subject}<br><br>
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                </div>
                
                <p style="color: #1a202c; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                  I typically respond within 24-48 hours. If your inquiry is urgent, feel free to call me at +91-8839402743.
                </p>
                
                <p style="color: #1a202c; font-size: 16px; line-height: 1.6;">
                  Best regards,<br>
                  <strong>Shubham Meena</strong><br>
                  <span style="color: #007AFF;">Web Developer & Full-Stack Engineer</span>
                </p>
              </div>
              
              <div style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #718096; font-size: 14px;">
                  This is an automated response. Please do not reply to this email.<br>
                  Visit my portfolio: <a href="https://shubhammeena.netlify.app" style="color: #007AFF;">shubhammeena.netlify.app</a>
                </p>
              </div>
            </div>
          `,
          text: `
Hi ${name},

Thanks for reaching out! I've received your message and will get back to you as soon as possible.

Your message:
Subject: ${subject}

${message}

I typically respond within 24-48 hours. If your inquiry is urgent, feel free to call me at +91-8839402743.

Best regards,
Shubham Meena
Web Developer & Full-Stack Engineer

---
This is an automated response. Please do not reply to this email.
Visit my portfolio: https://shubhammeena.netlify.app
          `
        };

        await sgMail.send(autoReplyOptions);
        autoReplyStatus = 'sent_sendgrid';
        
      } else if (successfulService === 'Gmail') {
        // Send auto-reply via Gmail SMTP
        const transporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS
          },
          tls: {
            rejectUnauthorized: false
          }
        });

        const autoReplyOptions = {
          from: `"Shubham Meena" <${process.env.MAIL_USER}>`,
          to: email,
          subject: `Re: ${subject} - Message Received`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
              <div style="background: linear-gradient(135deg, #007AFF 0%, #0051D5 100%); color: white; padding: 30px; text-align: center;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Thank You for Your Message</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Auto-reply from Shubham Meena</p>
              </div>
              
              <div style="padding: 30px;">
                <p style="color: #1a202c; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                  Hi <strong>${name}</strong>,
                </p>
                
                <p style="color: #1a202c; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                  Thanks for reaching out! I've received your message and will get back to you as soon as possible.
                </p>
                
                <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #007AFF;">
                  <h3 style="margin: 0 0 15px 0; color: #1a202c; font-size: 16px;">Your message:</h3>
                  <div style="color: #4a5568; line-height: 1.6;">
                    <strong>Subject:</strong> ${subject}<br><br>
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                </div>
                
                <p style="color: #1a202c; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                  I typically respond within 24-48 hours. If your inquiry is urgent, feel free to call me at +91-8839402743.
                </p>
                
                <p style="color: #1a202c; font-size: 16px; line-height: 1.6;">
                  Best regards,<br>
                  <strong>Shubham Meena</strong><br>
                  <span style="color: #007AFF;">Web Developer & Full-Stack Engineer</span>
                </p>
              </div>
              
              <div style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; color: #718096; font-size: 14px;">
                  This is an automated response. Please do not reply to this email.<br>
                  Visit my portfolio: <a href="https://shubhammeena.netlify.app" style="color: #007AFF;">shubhammeena.netlify.app</a>
                </p>
              </div>
            </div>
          `,
          text: `
Hi ${name},

Thanks for reaching out! I've received your message and will get back to you as soon as possible.

Your message:
Subject: ${subject}

${message}

I typically respond within 24-48 hours. If your inquiry is urgent, feel free to call me at +91-8839402743.

Best regards,
Shubham Meena
Web Developer & Full-Stack Engineer

---
This is an automated response. Please do not reply to this email.
Visit my portfolio: https://shubhammeena.netlify.app
          `
        };

        await transporter.sendMail(autoReplyOptions);
        autoReplyStatus = 'sent_gmail';
      }
      
      console.log(`Auto-reply sent successfully via ${successfulService}`);
      
    } catch (error) {
      console.error('Auto-reply failed (non-blocking):', error);
      autoReplyError = error.message;
      autoReplyStatus = 'failed';
      // Don't return error - auto-reply failure shouldn't block the main flow
    }

    // Return success response with both main email and auto-reply status
    return res.status(200).json({
      success: true,
      message: 'Thank you for your message! I\'ll get back to you soon.',
      data: {
        mainEmail: mainEmailResponse,
        autoReply: {
          status: autoReplyStatus,
          service: successfulService,
          error: autoReplyError,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Unexpected error in contact controller:', error);
    
    return res.status(500).json({
      success: false,
      message: 'An unexpected error occurred. Please contact me directly at shubhammeena1207@gmail.com',
      errors: [
        { field: 'server', message: 'Internal server error.' }
      ],
      debug: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
};

module.exports = {
  sendContactEmail
};