'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useUIStore } from '@/lib/store/uiStore';

export default function TestPage() {
  const { addNotification, theme, toggleTheme } = useUIStore();
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const handleTestNotification = () => {
    addNotification({
      type: 'success',
      title: 'Test Notification',
      message: 'This is a test notification from the UI store!',
      read: false,
    });
  };

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Component Test Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Button Tests */}
        <Card>
          <h2 className="text-xl font-semibold mb-4">Buttons</h2>
          <div className="space-y-3">
            <Button variant="primary">Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="outline">Outline Button</Button>
            <Button variant="ghost">Ghost Button</Button>
            <Button variant="danger">Danger Button</Button>
            <Button isLoading>Loading Button</Button>
            <Button fullWidth>Full Width Button</Button>
          </div>
        </Card>

        {/* Input Tests */}
        <Card>
          <h2 className="text-xl font-semibold mb-4">Inputs</h2>
          <div className="space-y-4">
            <Input 
              label="Username" 
              placeholder="Enter your username" 
            />
            <Input 
              label="Email" 
              type="email" 
              placeholder="Enter your email" 
            />
            <Input 
              label="Password" 
              type="password" 
              placeholder="Enter your password" 
              error="This is a validation error"
            />
          </div>
        </Card>

        {/* Theme and Modal Tests */}
        <Card>
          <h2 className="text-xl font-semibold mb-4">UI Features</h2>
          <div className="space-y-4">
            <div>
              <p className="mb-2">Current Theme: <span className="font-medium">{theme}</span></p>
              <Button onClick={toggleTheme}>
                Toggle Theme
              </Button>
            </div>
            
            <div>
              <Button onClick={() => setIsModalOpen(true)}>
                Open Modal
              </Button>
              <Modal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)}
                title="Test Modal"
              >
                <p>This is a test modal component.</p>
                <div className="mt-4">
                  <Button onClick={() => setIsModalOpen(false)}>
                    Close
                  </Button>
                </div>
              </Modal>
            </div>
          </div>
        </Card>

        {/* Notification Test */}
        <Card>
          <h2 className="text-xl font-semibold mb-4">Notifications</h2>
          <Button onClick={handleTestNotification}>
            Show Test Notification
          </Button>
        </Card>
      </div>
    </div>
  );
}