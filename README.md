# ContractEase - Frontend UI

A professional, mobile-first web application UI for contract creation and e-signing built with HTML, CSS, and JavaScript.

## Project Structure

```
frontend/
├── pages/
│   ├── user-login.html          # User account login
│   ├── client-login.html        # Client portal login
│   ├── user-dashboard.html      # User contract management dashboard
│   ├── client-dashboard.html    # Client contract review portal
│   ├── create-contract.html     # Contract creation wizard
│   └── sign-contract.html       # Contract signing interface
│
├── css/
│   ├── main.css                 # Base styles & design tokens
│   ├── auth.css                 # Authentication page styles
│   ├── dashboard.css            # Dashboard & navigation styles
│   └── contract.css             # Contract editor & signing styles
│
├── js/
│   ├── auth.js                  # Authentication logic
│   ├── dashboard.js             # Dashboard interactions
│   ├── contract.js              # Contract creation & signing
│   └── api.js                   # API communication helper
│
├── components/
│   ├── navbar.html              # Reusable navigation bar
│   └── contract-card.html       # Reusable contract card component
│
└── public/                      # Static assets (images, icons, etc.)
```

## Design Features

### Colors
- **Primary**: #0066cc (Blue) - Main action color
- **Secondary**: #10b981 (Green) - Success/confirmation color
- **Background**: #ffffff (White)
- **Surface**: #f9fafb (Light Gray)
- **Text Primary**: #1f2937 (Dark Gray)
- **Accents**: Error (#ef4444), Warning (#f59e0b)

### Typography
- **Font Family**: System font stack (-apple-system, BlinkMacSystemFont, Segoe UI, etc.)
- **Headings**: Bold, up to 2rem
- **Body**: Regular weight, 1rem with 1.6 line-height

### Components
- **Buttons**: Primary, secondary, outline variations
- **Cards**: Container components for content
- **Forms**: Labeled inputs with focus states
- **Badges**: Status indicators
- **Alerts**: Success and error messaging
- **Toggles**: Interactive switch components

## Pages Overview

### Authentication Pages
- **User Login**: For service providers/contract creators
- **Client Login**: For clients reviewing and signing contracts
- Both with email, password, and remember-me functionality

### User Dashboard
- Welcome message with personalized greeting
- Quick action buttons (Create Contract, Import)
- Three sections: Draft, Pending, and Signed contracts
- Contract cards showing key information
- Edit, view, send reminder, download actions

### Client Dashboard
- Action-focused layout for pending signatures
- Contracts requiring signature highlighted
- Already signed contracts archive
- Two main sections with status indicators

### Create Contract Wizard
- **Step 1**: Contract type selection (6 templates)
- **Step 2**: Contract details & clause configuration
- **Step 3**: Preview and final review
- Progress indicator for multi-step flow
- Toggle switches for optional clauses

### Sign Contract
- Full contract preview
- Canvas-based signature capture (mouse & touch)
- Signer information form
- Contract metadata display
- Accept/decline options

## Features

### Mobile-First Responsive Design
- Optimized for all screen sizes
- Flexible grid layouts (1 → 2 → 3 columns)
- Touch-friendly buttons and inputs
- Mobile menu toggle for navigation

### Interactive Components
- Form validation
- Mobile menu toggle
- Contract type selection
- Clause toggle switches
- Canvas signature capture (mouse and touch support)
- Step navigation with progress indicator

### User Experience
- Clear navigation with breadcrumbs
- Status badges for contract states
- Empty states for guidance
- Confirmation dialogs for critical actions
- Logout functionality with session management

### Accessibility
- Semantic HTML structure
- Proper form labels
- Color contrast compliance
- Keyboard navigation support
- ARIA attributes where needed

## Getting Started

### Opening Pages Locally
1. Open any `.html` file directly in your browser
2. Or use a local server for better experience:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js (with http-server)
   npx http-server
   ```

### Testing Flows
- **User Flow**: Start at `user-login.html` → user-dashboard.html → create-contract.html
- **Client Flow**: Start at `client-login.html` → client-dashboard.html → sign-contract.html
- Use any email/password for testing (no backend validation)

## Converting to React/Next.js

The HTML/CSS structure is designed to be easily converted to React:

1. **HTML Components**: Each page can become a React component
2. **CSS Classes**: Use className attribute in JSX
3. **Interactions**: JavaScript event handlers convert to React event handlers
4. **State Management**: Use useState/useContext for form states
5. **Navigation**: Replace href with Next.js Link or React Router

Example conversion for user-login.html:
```jsx
// Login.jsx
import { useState } from 'react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // Handle login logic
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Form JSX */}
      </div>
    </div>
  );
}
```

## Browser Support
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Android Chrome)
- Canvas support required for signature capture

## Notes
- This is a frontend UI implementation - backend APIs need to be implemented
- Signature canvas uses HTML5 Canvas API
- Local storage is used for session management in demo mode
- All API calls are mocked for testing purposes

## Future Enhancements
- Backend API integration
- PDF generation and download
- Email notifications
- Document versioning
- Audit trail
- Advanced clause library
- Multi-language support
- Dark mode theme
