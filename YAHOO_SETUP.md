# Yahoo OAuth Setup Guide for Eflow

This guide will walk you through setting up Yahoo OAuth so you can connect your real Yahoo email account to Eflow.

## Prerequisites

- A Yahoo account
- Access to Yahoo Developer Console
- Admin access to your Supabase project

## Step 1: Create a Yahoo Developer App

1. **Go to Yahoo Developer Console**
   - Visit: https://developer.yahoo.com/
   - Click "My Apps" in the top menu
   - Sign in with your Yahoo account if prompted

2. **Create a New App**
   - Click "Create an App" button
   - Fill in the app details:
     - **Application Name**: Eflow (or your preferred name)
     - **Application Type**: Web Application
     - **Description**: AI-powered email cleanup assistant
     - **Home Page URL**: Your app URL (e.g., `https://your-domain.com`)
     - **Redirect URI(s)**: Add the following (CRITICAL - must match exactly):
       ```
       https://xgfivlojeymxfcjmjrac.supabase.co/functions/v1/yahoo-oauth-callback
       ```
       ⚠️ This MUST match exactly or Yahoo will reject the OAuth flow

3. **Select API Permissions**
   - Under "API Permissions", select:
     - **Mail**: Check "Read" permission
   - This allows the app to read your emails but not modify them without explicit approval

4. **Save and Get Credentials**
   - Click "Create App"
   - You'll see your **Client ID (Consumer Key)** and **Client Secret (Consumer Secret)**
   - **IMPORTANT**: Copy these values immediately - you'll need them for configuration

## Step 2: Configure Environment Variables

### For Local Development (.env file)

Add these variables to your `.env` file in the project root:

```env
# Yahoo OAuth Configuration
VITE_YAHOO_CLIENT_ID=your_yahoo_client_id_here
VITE_YAHOO_CLIENT_SECRET=your_yahoo_client_secret_here
VITE_YAHOO_REDIRECT_URI=http://localhost:54321/functions/v1/yahoo-oauth-callback

# App URL (for OAuth callback redirect)
VITE_APP_URL=http://localhost:5173
```

### For Supabase Edge Functions

You need to set environment secrets for your edge functions:

1. **Using Supabase Dashboard**:
   - Go to your Supabase project
   - Navigate to "Edge Functions" → "Manage secrets"
   - Add the following secrets:
     - `YAHOO_CLIENT_ID`: Your Yahoo Client ID
     - `YAHOO_CLIENT_SECRET`: Your Yahoo Client Secret
     - `YAHOO_REDIRECT_URI`: Your OAuth callback URL
     - `APP_URL`: Your frontend app URL

2. **Using Supabase CLI** (Alternative):
   ```bash
   supabase secrets set YAHOO_CLIENT_ID=your_client_id
   supabase secrets set YAHOO_CLIENT_SECRET=your_client_secret
   supabase secrets set YAHOO_REDIRECT_URI=https://your-project.supabase.co/functions/v1/yahoo-oauth-callback
   supabase secrets set APP_URL=https://your-app-url.com
   ```

## Step 3: Update Yahoo App Settings (Production)

When you're ready to deploy to production:

1. Go back to Yahoo Developer Console
2. Edit your app
3. Update the **Redirect URI** to your production callback URL:
   ```
   https://[YOUR-PROJECT-REF].supabase.co/functions/v1/yahoo-oauth-callback
   ```
4. Update **Home Page URL** to your production domain

## Step 4: Test the Integration

1. **Start your development server**:
   ```bash
   npm run dev
   ```

2. **Open the app** in your browser

3. **Select Yahoo Mail** as your provider

4. **Click "Continue with Yahoo Mail"**
   - You'll be redirected to Yahoo's login page
   - Sign in with your Yahoo credentials
   - Authorize the app to read your emails

5. **After authorization**:
   - You'll be redirected back to Eflow
   - The app will automatically scan your inbox
   - Your emails will be categorized by AI

## Troubleshooting

### Error: "Yahoo OAuth is not configured"
- Make sure `VITE_YAHOO_CLIENT_ID` is set in your `.env` file
- Restart your development server after adding the variable

### Error: "redirect_uri_mismatch"
- The redirect URI in your Yahoo app must exactly match the one you're using
- Check for trailing slashes and http vs https
- Common values:
  - Local: `http://localhost:54321/functions/v1/yahoo-oauth-callback`
  - Production: `https://[project-ref].supabase.co/functions/v1/yahoo-oauth-callback`

### Error: "Token exchange failed"
- Verify your Client ID and Client Secret are correct
- Make sure secrets are properly set in Supabase
- Check that the secrets don't have extra spaces or characters

### Error: "Failed to fetch emails"
- Your access token may have expired
- Try reconnecting your Yahoo account
- Check that your Yahoo app has "Mail Read" permission enabled

## Security Notes

- **Never commit** your Client Secret to version control
- Always use environment variables for sensitive credentials
- The app stores OAuth tokens securely in your Supabase database
- Tokens are encrypted and protected by Row Level Security (RLS)
- Only you can access your own email data

## Yahoo Mail API Limits

- Yahoo Mail API has rate limits
- Free tier typically allows reasonable personal use
- If you hit rate limits, the app will display an error
- Consider implementing caching to reduce API calls

## Next Steps

After setup is complete:
- Test the OAuth flow with your Yahoo account
- Verify emails are being fetched and categorized correctly
- Use the cleanup features to manage your inbox
- Provide feedback for improvements

## Need Help?

If you encounter issues:
1. Check the browser console for error messages
2. Verify all environment variables are set correctly
3. Ensure your Yahoo app has the correct permissions
4. Review the edge function logs in Supabase dashboard

## Additional Resources

- [Yahoo OAuth Documentation](https://developer.yahoo.com/oauth2/guide/)
- [Yahoo Mail API Documentation](https://developer.yahoo.com/mail/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
