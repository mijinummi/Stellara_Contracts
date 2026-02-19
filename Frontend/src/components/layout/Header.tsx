import React from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/authStore';
import { useUIStore } from '@/lib/store/uiStore';
import { Button } from '@/components/ui/Button';
import { truncateAddress } from '@/lib/utils/formatting';

export const Header: React.FC = () => {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { toggleSidebar } = useUIStore();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo and Mobile menu button */}
          <div className="flex items-center">
            <button
              onClick={toggleSidebar}
              className="md:hidden mr-2 p-2 rounded-md text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            <Link href="/" className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <span className="text-2xl font-bold gradient-text">Stellara</span>
                <span className="text-2xl font-bold text-gray-900 ml-1">AI</span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            <Link href="/academy" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
              Academy
            </Link>
            <Link href="/feed" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
              Feed
            </Link>
            <Link href="/chat" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
              Chat
            </Link>
            <Link href="/trade" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
              Trade
            </Link>
          </nav>

          {/* User Actions */}
          <div className="flex items-center space-x-4">
            {isAuthenticated && user ? (
              <div className="flex items-center space-x-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-medium text-gray-900">{user.username}</span>
                  {user.walletAddress && (
                    <span className="text-xs text-gray-500">
                      {truncateAddress(user.walletAddress)}
                    </span>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={logout}
                >
                  Logout
                </Button>
              </div>
            ) : (
              <div className="flex space-x-2">
                <Link href="/login">
                  <Button variant="ghost" size="sm">
                    Login
                  </Button>
                </Link>
                <Link href="/signup">
                  <Button size="sm">
                    Sign Up
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};