import React, { HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',
  className = '',
  ...props
}) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
          onClick={onClose}
        />
        
        {/* Modal */}
        <div
          className={`relative bg-white rounded-xl shadow-xl transform transition-all ${sizeClasses[size]} w-full ${className}`}
          {...props}
        >
          {title && (
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            </div>
          )}
          <div className="p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

interface ModalHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ 
  children, 
  className = '', 
  ...props 
}) => (
  <div className={`border-b border-gray-200 px-6 py-4 ${className}`} {...props}>
    {children}
  </div>
);

interface ModalContentProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const ModalContent: React.FC<ModalContentProps> = ({ 
  children, 
  className = '', 
  ...props 
}) => (
  <div className={`p-6 ${className}`} {...props}>
    {children}
  </div>
);

interface ModalFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({ 
  children, 
  className = '', 
  ...props 
}) => (
  <div className={`border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-xl ${className}`} {...props}>
    {children}
  </div>
);