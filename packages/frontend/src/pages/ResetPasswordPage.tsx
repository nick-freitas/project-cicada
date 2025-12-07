import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { confirmResetPassword } from 'aws-amplify/auth';

export function ResetPasswordPage() {
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password strength
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one number');
      return;
    }

    setIsLoading(true);

    try {
      await confirmResetPassword({
        username,
        confirmationCode: code,
        newPassword,
      });
      
      // Success - redirect to login
      navigate('/login', {
        state: { message: 'Password reset successful. Please sign in with your new password.' },
      });
    } catch (err: any) {
      console.error('Password reset confirmation error:', err);
      if (err.name === 'CodeMismatchException') {
        setError('Invalid verification code. Please check and try again.');
      } else if (err.name === 'ExpiredCodeException') {
        setError('Verification code has expired. Please request a new one.');
      } else if (err.name === 'LimitExceededException') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message || 'Failed to reset password. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Reset your password
          </h2>
          <p className="mt-2 text-center text-sm text-gray-400">
            Enter the verification code from your email
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-900/50 border border-red-700 p-4">
              <div className="text-sm text-red-200">{error}</div>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Username"
              />
            </div>

            <div>
              <label htmlFor="code" className="sr-only">
                Verification code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Verification code"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="sr-only">
                New password
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="New password"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2 border border-gray-700 placeholder-gray-500 text-white bg-gray-800 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholder="Confirm new password"
              />
            </div>
          </div>

          <div className="text-xs text-gray-400 space-y-1">
            <p>Password requirements:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>At least 8 characters long</li>
              <li>Contains uppercase and lowercase letters</li>
              <li>Contains at least one number</li>
            </ul>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Resetting password...' : 'Reset password'}
            </button>
          </div>

          <div className="flex items-center justify-between text-sm">
            <Link
              to="/forgot-password"
              className="font-medium text-blue-400 hover:text-blue-300"
            >
              Resend code
            </Link>
            <Link
              to="/login"
              className="font-medium text-blue-400 hover:text-blue-300"
            >
              Back to sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
