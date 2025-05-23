const express = require("express");
const multer = require("multer");
const Event = require("../models/Event");
const NGO = require("../models/NGO"); // Import the NGO model
const { verifyToken,verifyUser, verifyNGO, isNGO, verifyAdmin, isAdmin } = require("../middleware/authMiddleware");
const auth = require('../middleware/auth'); // Add this line
const nodemailer = require("nodemailer");
const router = express.Router();
const Applier = require("../models/Applier");
const contactController = require('../controllers/contactController');
const Volunteer = require("../models/Volunteer");
const admin = require("../models/admin");
const path = require('path'); // Add this line
const User = require('../models/User');

// Function to sanitize file names (replace spaces with underscores)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'belayketemateme44@gmail.com',
    pass: 'osrp pfgr pprv wgsz',
  },
});

// Function to sanitize file names (replace spaces with underscores)
const sanitizeFilename = (filename) => {
  return filename.replace(/\s+/g, "_"); // Replace spaces with underscores
};
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads')); // Use absolute path
  },
  filename: (req, file, cb) => {
    const sanitizedFilename = file.originalname.replace(/\s+/g, "_");
    cb(null, Date.now() + "-" + sanitizedFilename);
  },
});

const upload = multer({ storage });
router.post("/create", verifyToken, verifyNGO, isNGO, upload.single("image"), async (req, res) => {
  try {
    const { name, description, startDate, endDate, location } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start and end dates are required." });
    }

    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const newEvent = new Event({
      name,
      description,
      startDate,
      endDate,
      location,
      image: imagePath,
      status: "pending",
      createdBy: req.user.id,
    });

    await newEvent.save();

    res.status(201).json({ message: "Event created successfully! Pending admin approval." });

  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});

router.get('/my-events', verifyToken, async (req, res) => {
  try {
    // ... existing validation code ...
    
    const events = await Event.find({ createdBy: req.user.id })
      .sort({ date: 1 })
      .populate('likes', 'name email')
      .populate('comments.userId', 'name email');

    // Return just the array instead of wrapped object
    res.status(200).json(events);
    
  } catch (error) {
    console.error('Error fetching NGO events:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
router.post('/contact', contactController.submitContactForm);

exports.getMyEvents = async (req, res) => {
  try {
      // Verify user is authenticated
      if (!req.user || !req.user.id) {
          return res.status(401).json({ 
              success: false,
              message: 'Unauthorized: User not authenticated'
          });
      }

      // Find events where user is the organizer OR attendee
      const events = await Event.find({
          $or: [
              { organizer: req.user.id },
              { attendees: req.user.id }
          ]
      })
      .populate('organizer', 'name email') // Include organizer details
      .populate('attendees', 'name email') // Include attendee details
      .sort({ date: 1 }); // Sort by date ascending

      if (!events || events.length === 0) {
          return res.status(200).json({ 
              success: true,
              message: 'No events found for this user',
              data: []
          });
      }

      res.status(200).json({
          success: true,
          count: events.length,
          data: events
      });

  } catch (error) {
      console.error('Error fetching user events:', error);
      res.status(500).json({
          success: false,
          message: 'Internal server error',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
  }
};


router.post("/events/create", verifyToken, verifyNGO, upload.single("image"), async (req, res) => {
  try {
    const { name, description, startDate, endDate, location } = req.body;
    
    // Validate dates
    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ message: "End date must be after start date" });
    }

    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const newEvent = new Event({
      name,
      description,
      startDate,
      endDate,
      location,
      image: imagePath,
      status: "pending",
      createdBy: req.user.id,
    });

    await newEvent.save();
    res.status(201).json({ 
      message: "Event created successfully! Pending admin approval.",
      event: newEvent 
    });
  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
});
// Add this route to get event counts

router.get("/", async (req, res) => {
  try {
    const events = await Event.find({ approved: true });
    res.status(200).json(events);
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({ message: "Server error" });
}
});

/**
 * @route   GET /api/events/pending
 * @desc    Get all pending events (for admin approval)
 * @access  Admin only
 **/
router.get("/pending", async (req, res) => {
  try {
    // Get token from Authorization header
    const token = req.header("Authorization");
    console.log("Pending events - token received:", token ? "Token exists" : "No token");
    
    if (!token) {
      return res.status(401).json({ message: "No authorization token provided" });
    }
    
    // Clean the token (remove Bearer if present)
    const tokenValue = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
    
    // Verify token manually to get user info
    const jwt = require("jsonwebtoken");
    const secretKey = process.env.JWT_SECRET || "your-secret-key"; 
    
    try {
      const decoded = jwt.verify(tokenValue, secretKey);
      console.log("Pending events - token decoded:", decoded);
      
      // Simplified admin check - more permissive for testing
      const isAdmin = 
        decoded.role === "admin" || 
        decoded.role === "Admin" ||
        (decoded.email && decoded.email.includes("admin"));
      
      if (!isAdmin) {
        console.log("User not admin:", decoded);
        return res.status(403).json({ message: "Access denied. Admin role required." });
      }
      
      // If we get here, the user is an admin
      const pendingEvents = await Event.find({ status: "pending" });
      console.log("Found pending events:", pendingEvents.length);
      
      return res.status(200).json(pendingEvents);
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError);
      return res.status(401).json({ message: "Invalid token", error: jwtError.message });
    }
  } catch (error) {
    console.error("Error fetching pending events:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   PUT /api/events/approve/:id
 * @desc    Admin approves an event
 * @access  Admin only
 * 
 * 
 * 
 */

const sendApprovalEmail = async (userEmail, eventName) => {
  try {
    if (!userEmail) {
      console.error("❌ Error: No recipient email provided!");
      return;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Your email
        pass: process.env.EMAIL_PASS, // Your email password
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail, // Ensure this is not empty
      subject: "Event Approval Notification",
      text: `Hello, your event "${eventName}" has been successfully approved by the admin.`,
      html: `<p>Hello,</p>
             <p>Your event <strong>"${eventName}"</strong> has been successfully <b style="color: green;">approved</b> by the admin.</p>
             <p>Thank you for using our platform!</p>`,
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ Email notification sent successfully!");
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
};
// POST endpoint to add a new volunteer
router.post("/", async (req, res) => {
  try {
    console.log("Volunteer application request:", req.body);

    // Validate required fields
    const { name, sex, skills, age, eventId, eventCreatorId } = req.body;
    if (!name || !sex || !skills || !age || !eventId || !eventCreatorId) {
      return res.status(400).json({ 
        success: false,
        error: "All fields are required",
        requiredFields: ["name", "sex", "skills", "age", "eventId", "eventCreatorId"]
      });
    }

    if (isNaN(age)) {
      return res.status(400).json({ 
        success: false,
        error: "Age must be a number"
      });
    }
    

    // Check if the event exists
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ 
        success: false,
        error: "Event not found" 
      });
    }

    // Create new volunteer application
    const newVolunteer = new Applier({
      name,
      sex,
      skills,
      age: parseInt(age),
      eventId,
      eventName: event.name,
      eventCreatorId,
      applicationDate: new Date()
    });

    // Save to database
    await newVolunteer.save();
    
    // Update event's volunteers count
    await Event.findByIdAndUpdate(eventId, { 
      $inc: { volunteersApplied: 1 } 
    });

    res.status(201).json({
      success: true,
      data: newVolunteer,
      message: "Volunteer application submitted successfully"
    });

  } catch (error) {
    console.error("Error in volunteer application:", error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error",
      details: error.message 
    });
  }
});
router.get("/", async (req, res) => {
  const { creatorId, eventId, sortBy, search } = req.query;

  // Validate creatorId
  if (!creatorId || !mongoose.Types.ObjectId.isValid(creatorId)) {
    return res.status(400).json({ 
      success: false,
      message: "Valid creatorId is required" 
    });
  }

  try {
    // Build query
    const query = { eventCreatorId: creatorId };
    
    // Add eventId filter if provided
    if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
      query.eventId = eventId;
    }
    
    // Add search filter if provided
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { skills: { $regex: search, $options: 'i' } },
        { eventName: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort options
    const sortOptions = {};
    if (sortBy === 'name') sortOptions.name = 1;
    if (sortBy === 'age') sortOptions.age = 1;
    if (sortBy === 'recent') sortOptions.applicationDate = -1;

    // Execute query
    const volunteers = await Applier.find(query)
      .populate({
        path: 'eventId',
        select: 'name date location',
        model: 'Event'
      })
      .sort(sortOptions)
      .lean();

    // Format response data
    const formattedVolunteers = volunteers.map(volunteer => ({
      ...volunteer,
      eventName: volunteer.eventId?.name || volunteer.eventName,
      eventDate: volunteer.eventId?.date 
        ? new Date(volunteer.eventId.date).toLocaleDateString() 
        : 'Unknown',
      eventLocation: volunteer.eventId?.location || 'Unknown'
    }));

    res.json({
      success: true,
      count: formattedVolunteers.length,
      data: formattedVolunteers
    });

  } catch (error) {
    console.error("Error fetching volunteers:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch volunteers",
      error: error.message 
    });
  }
});

// For event deletion (assuming owners can delete their own events)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    // Check if event exists
    if (!event) {
      return res.status(404).json({ 
        success: false,
        message: "Event not found"
      });
    }
    
    // Check ownership (assuming createdBy stores user ID)
    if (event.createdBy.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this event"
      });
    }
    
    await event.deleteOne();
    
    res.json({
      success: true,
      message: "Event deleted successfully"
    });
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: "Server error during deletion"
    });
  }
});
// Renew an event
router.put('/renew/:id', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if the requesting user is the creator of the event
    if (event.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to renew this event' });
    }

    // Only allow renewing approved or expired events
    if (event.status === 'pending') {
      return res.status(400).json({ error: 'Pending events cannot be renewed' });
    }

    if (event.status === 'rejected') {
      return res.status(400).json({ error: 'Rejected events cannot be renewed' });
    }

    const renewedEvent = await event.renew();
    res.json(renewedEvent);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});
// Backend (Express)
const updateEventStatus = async (req, res) => {
  const { id, status } = req.params; // Get the status ('approve' or 'reject')
  const event = await Event.findById(id);
  
  if (!event) {
    return res.status(404).json({ message: 'Event not found' });
  }
  
  if (status === 'approve') {
    event.status = 'approved';
    await event.save();
    // Send approval email
    await sendApprovalEmail(event);
    return res.status(200).json({ message: 'Event successfully approved' });
  }
  
  if (status === 'reject') {
    event.status = 'rejected';
    await event.save();
    // Send rejection email
    await sendRejectionEmail(event);
    return res.status(200).json({ message: 'Event successfully rejected' });
  }
  
  return res.status(400).json({ message: 'Invalid status' });
};

// Email Notification for rejection
const sendRejectionEmail = async (event) => {
  const user = await User.findById(event.createdBy); // Get the user's email
  
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'your_email@gmail.com',
      pass: 'your_password',
    },
  });

  const mailOptions = {
    from: 'your_email@gmail.com',
    to: user.email,
    subject: 'Event Rejection Notification',
    text: `Sorry, your event "${event.name}" has been rejected by the admin.`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Rejection email sent successfully');
  } catch (error) {
    console.error('Error sending rejection email:', error);
  }
};

router.put("/approve/:id", async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      console.error("❌ Event not found!");
      return res.status(404).json({ error: "Event not found" });
    }

    event.status = "approved"; // Update status
    await event.save();

    console.log("✅ Event approved:", event);

    // Fetch NGO email
    const ngo = await NGO.findById(event.createdBy);
    if (!ngo || !ngo.email) {
      console.error("❌ NGO email not found!");
      return res.status(400).json({ error: "NGO email not found" });
    }

    console.log("📧 Sending email to:", ngo.email);

    await sendApprovalEmail(ngo.email, event.name);
    res.json({ message: "Event approved successfully. Approval email sent to NGO." });
  } catch (error) {
    console.error("❌ Error approving event:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//   await sendApprovalEmail(ngo.email, event.name);
// res.json({ message: "Event approved successfully" });
router.get("/approved", async (req, res) => {
  try {
    // Fetch approved events and include volunteers array
    const events = await Event.find({ status: "approved" });
const eventsWithVolunteerCount = await Promise.all(events.map(async (event) => {
  const volunteerCount = await Applier.countDocuments({ eventId: event._id });
  return {
    ...event._doc,
    volunteers: volunteerCount,
    image: event.image ? http://localhost:5000${event.image} : null,
  };
}));
router.get("/:eventId", async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    const volunteerCount = await Applier.countDocuments({ eventId: event._id });
    const eventWithFullImageUrl = {
      ...event._doc,
      image: event.image ? `http://localhost:5000${event.image}` : null,
      volunteers: volunteerCount, // <-- This is a number!
    };
    res.status(200).json(eventWithFullImageUrl);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

  

router.post("/rejected", async (req, res) => {
  try {
    const { status } = req.body;
    const rejectedEvents = await Event.find({ status });
    res.status(200).json(rejectedEvents);
  } catch (error) {
    console.error("Error fetching rejected events:", error);
    res.status(500).json({ message: "Server error" });
  }
});


// Disapprove event
router.put("/disapprove/:id", async (req, res) => {
  try {
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },  // Change the status to 'pending'
      { new: true }
    );
    if (!updatedEvent) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.status(200).json(updatedEvent);
  } catch (error) {
    console.error("Error disapproving event:", error);
    res.status(500).json({ error: "Failed to disapprove event" });
  }
});


router.put("/unreject/:id", async (req, res) => {
  try {
    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      { status: "pending" },
      { new: true }
    );
    if (!updatedEvent) {
      return res.status(404).json({ error: "Event not found" });
    }
    res.status(200).json(updatedEvent);
  } catch (error) {
    console.error("Error unrejecting event:", error);
    res.status(500).json({ error: "Failed to unreject event" });
  }
});


router.put("/reject/:id", async (req, res) => {
  try {
    console.log(`Received request to reject event with ID: ${req.params.id}`);

    // Fetch the event by its ID
    const event = await Event.findById(req.params.id);
    if (!event) {
      console.log("Event not found");
      return res.status(404).json({ error: "Event not found" });
    }

    console.log("Event found:", event);

    // Find NGO using event.createdBy
    const ngo = await NGO.findById(event.createdBy); // Assuming createdBy stores NGO ID
    if (!ngo || !ngo.email) {
      console.log("NGO email not found.");
      return res.status(400).json({ error: "NGO email not found" });
    }

    console.log("NGO found:", ngo);

    // Update the status to 'rejected'
    event.status = "rejected";  
    await event.save();

    console.log("Event successfully rejected:", event);

    // Send email notification to the NGO
    console.log("Sending rejection email to:", ngo.email);

    // Configure Nodemailer
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Your email
        pass: process.env.EMAIL_PASS, // Your app password
      },
    });

    // Email content
    let mailOptions = {
      from: process.env.EMAIL_USER,
      to: ngo.email,
      subject: "Your Event Has Been Rejected",
      text: `Hello ${ngo.name},\n\nYour event "${event.name}" has been rejected. If you have any questions, please contact support.\n\nThank you.`,
    };

    // Send email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
      } else {
        console.log("Rejection Email sent:", info.response);
      }
    });

    // Return the updated event
    res.status(200).json({ message: "Event rejected successfully! Rejection Email sent to users", event });
  } catch (error) {
    console.error("Error rejecting event:", error);
    res.status(500).json({ error: "Failed to reject event" });
  }
});

// 📌 Get All Trackvolunters part for an Event
router.get("/my/:eventId", async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json({
      name: event.name || event.title,
      title: event.title,
      category: event.category,
      type: event.type,
      date: event.date,
      location: event.location,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Update volunteer status (Approve/Reject)
router.put("/:id", async (req, res) => {
  try {
    const updatedVolunteer = await Volunteer.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true } // Returns updated document
    );
    res.status(200).json(updatedVolunteer);
  } catch (error) {
    res.status(500).json({ message: "Error updating volunteer status", error });
  }
});

// DELETE: Delete an event by ID
router.delete("/delete/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    // Find and delete the event
    const deletedEvent = await Event.findByIdAndDelete(eventId);

    if (!deletedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    res.status(200).json({ message: "Event deleted successfully" });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
router.put('/events/:id', verifyToken, async (req, res) => {
  const { name, description, date, location, image, status } = req.body;
  console.log(req.body)

  try {
    // Find the event by ID
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if the user is the creator of the event
    if (event.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to edit this event' });
    }

    // Update fields
    event.name = name || event.name;
    event.description = description || event.description;
    event.date = date || event.date;
    event.location = location || event.location;
    event.image = image || event.image; // Optional field
    event.status = status || event.status; // Optional field

    // Save the updated event
    await event.save();

    res.status(200).json({ message: 'Event updated successfully', event });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});router.post("/:eventId/register", verifyToken, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id; // should be a string
    const { sex, skills, age } = req.body;

    // Always compare as string
    const alreadyRegistered = await Applier.findOne({ 
      userId: String(userId), 
      eventId: String(eventId) 
    });
    
    if (alreadyRegistered) {
      return res.status(400).json({ message: "Already registered for this event" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const user = await Volunteer.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Create new applier record
    const applier = new Applier({
      userId: String(user._id),
      name: user.name,
      sex,
      skills,
      age,
      eventId: String(event._id),
      eventCreatorId: event.createdBy,
      // Add notification preferences (default to true)
      receiveNotifications: req.body.receiveNotifications !== false
    });

    await applier.save();

    // Add volunteer to event's volunteers array
    await Event.findByIdAndUpdate(
      eventId,
      { $addToSet: { volunteers: userId } },
      { new: true }
    );

    // Send immediate confirmation email
    try {
      await sendConfirmationEmail(user, event);
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
      // Don't fail the registration if email fails
    }

    res.status(201).json({ 
      message: "Registered successfully",
      receiveNotifications: applier.receiveNotifications
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Registration failed" });
  }
});

// Email sending function
async function sendConfirmationEmail(user, event) {
  const transporter = nodemailer.createTransport({
    service: 'gmail', // or your email service
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: `Confirmation: You're registered for ${event.name}`,
    html: `
      <h1>Registration Confirmed</h1>
      <p>Hello ${user.name},</p>
      <p>You've successfully registered for the event <strong>${event.name}</strong>.</p>
      <p><strong>Event Details:</strong></p>
      <ul>
        <li>Date: ${event.startDate.toLocaleDateString()}</li>
        <li>Location: ${event.location}</li>
      </ul>
      <p>You'll receive reminders 5 days and 2 days before the event.</p>
      <p>Best regards,<br>The Event Team</p>
    `
  };

  await transporter.sendMail(mailOptions);
}

router.post("/:eventId/like/one", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { userId, like } = req.body; // like: true to like, false to unlike

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const alreadyLiked = event.likes.includes(userId);

    if (like && !alreadyLiked) {
      event.likes.push(userId);
    } else if (!like && alreadyLiked) {
      event.likes = event.likes.filter(id => id.toString() !== userId);
    }

    await event.save();
    res.json({ likes: event.likes });
  } catch (error) {
    res.status(500).json({ error: "Failed to update like" });
  }
});

// Get likes for an event
router.get("/:eventId/likes", async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json({ likes: event.likes });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch likes" });
  }
});
// Add a comment to an event
router.post("/:eventId/comments", async (req, res) => {
  try {
    const { eventId } = req.params;
    const { text, author, authorId, avatar } = req.body;

    if (!text || !author || !authorId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Add comment to event
    const comment = {
      userId: authorId,
      text,
      author,
      avatar,
      createdAt: new Date()
    };
    if (!event.comments) event.comments = [];
    event.comments.push(comment);
    await event.save();

    res.json({ comments: event.comments });
  } catch (error) {
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// Get comments for an event
router.get("/:eventId/comments", async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json({ comments: event.comments || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

router.get("/:eventId/is-registered", verifyToken, async (req, res) => {
  try {
    const eventId = req.params.eventId;
    const userId = req.user.id;
    const applier = await Applier.findOne({ eventId: String(eventId), userId: String(userId) });
    res.json({ registered: !!applier });
  } catch (error) {
    res.status(500).json({ registered: false });
  }
});
// ...existing code...

// GET /users/:id/stats
router.get('/:id/stats', async (req, res) => {
  try {
    const userId = req.params.id;

    // 1. Events attended: count of Applier docs for this user
    const eventsAttended = await Applier.countDocuments({ userId: String(userId) });

    // 2. Hours volunteered: If you don't track hours, you can estimate (e.g., 2 hours per event)
    // Or set to 0 if you don't want to estimate
    const hoursVolunteered = eventsAttended * 2; // Change 2 to your estimate per event

    // 3. Upcoming events: count of Applier docs where event date is in the future
    // Need to join with Event to check date
    const now = new Date();
    const upcomingApplies = await Applier.find({ userId: String(userId) }).populate('eventId');
    const upcomingEvents = upcomingApplies.filter(apply => {
      const event = apply.eventId;
      return event && event.date && new Date(event.date) >= now;
    }).length;

    // 4. Impact points: Example logic (10 points per event)
    const impactPoints = eventsAttended * 10;

    res.json({
      eventsAttended,
      hoursVolunteered,
      upcomingEvents,
      impactPoints
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Add this route for debugging token
router.get("/debug-token", (req, res) => {
  try {
    // Get token from Authorization header
    const token = req.header("Authorization");
    console.log("Debug token received:", token);
    
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }
    
    // Clean the token (remove Bearer if present)
    const tokenValue = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
    
    // Verify token manually
    const jwt = require("jsonwebtoken");
    
    // Make sure we have a consistent secret key - this should match what's used in login
    const secretKey = process.env.JWT_SECRET || "your-secret-key";
    console.log("Using JWT secret key (first 3 chars):", secretKey ? secretKey.substring(0, 3) + "..." : "undefined");
    
    try {
      const decoded = jwt.verify(tokenValue, secretKey);
      console.log("Token decoded successfully:", decoded);
      
      // Add role if missing
      if (!decoded.role && decoded.email && decoded.email.includes("admin")) {
        console.log("Adding missing admin role to token payload");
        decoded.role = "admin";
      }
      
      return res.status(200).json({
        user: decoded,
        message: "Token decoded successfully",
        isAdmin: decoded?.role?.toLowerCase() === "admin"
      });
    } catch (jwtError) {
      console.error("JWT verification error:", jwtError);
      
      // Try with a hardcoded fallback secret if the main one fails
      try {
        console.log("Trying fallback JWT verification");
        const fallbackSecret = "your-secret-key"; 
        const decoded = jwt.verify(tokenValue, fallbackSecret);
        console.log("Token decoded with fallback:", decoded);
        
        if (!decoded.role && decoded.email && decoded.email.includes("admin")) {
          console.log("Adding missing admin role to token payload");
          decoded.role = "admin";
        }
        
        return res.status(200).json({
          user: decoded,
          message: "Token decoded with fallback secret",
          isAdmin: decoded?.role?.toLowerCase() === "admin"
        });
      } catch (fallbackError) {
        console.error("Fallback JWT verification failed:", fallbackError);
        return res.status(401).json({ 
          message: "Invalid token", 
          error: jwtError.message,
          fallbackError: fallbackError.message
        });
      }
    }
  } catch (error) {
    console.error("Token debug error:", error);
    res.status(500).json({ message: "Error debugging token", error: error.message });
  }
});

module.exports = router;
