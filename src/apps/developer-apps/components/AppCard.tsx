import React from 'react';

// types
import { DeveloperApp } from '../api/developerAppsApi';

// icons
import XTwitterIcon from '../assets/icons/x-twitter.svg?react';
import TelegramIcon from '../assets/icons/telegram.svg?react';
import FacebookIcon from '../assets/icons/facebook.svg?react';
import TikTokIcon from '../assets/icons/tiktok.svg?react';

interface AppCardProps {
  app: DeveloperApp;
  onEdit: (appId: string) => void;
  onDelete: (appId: string) => void;
  onSendForReview: (appId: string) => void;
}

const AppCard: React.FC<AppCardProps> = ({
  app,
  onEdit,
  onDelete,
  onSendForReview,
}) => {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const tags = app.tags.split(',').map((tag) => tag.trim());

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 border border-purple-900/30 rounded-lg p-6 hover:border-purple-700/50 transition-all duration-300">
      {/* Header with Logo */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0">
          {app.logo && (
            <img
              src={app.logo}
              alt={`${app.name} logo`}
              className="w-16 h-16 rounded-lg object-cover border border-purple-900/30"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-bold text-white mb-1 truncate">
            {app.name}
          </h3>
          <p className="text-sm text-purple-400 font-mono truncate">
            {app.appId}
          </p>
        </div>
      </div>

      {/* Status Indicator */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-2 h-2 rounded-full ${
            app.isApproved ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span
          className={`text-xs font-semibold ${
            app.isApproved ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {app.isApproved ? 'LIVE' : 'Unpublished:'}
        </span>
        {!app.isApproved && !app.isInReview && (
          <button
            onClick={() => onSendForReview(app.appId)}
            className="text-xs text-purple-400 hover:text-purple-300 underline transition-colors"
          >
            Send for review?
          </button>
        )}
        {app.isInReview && (
          <span className="text-xs text-yellow-400 font-semibold">
            (In Review)
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-gray-300 text-sm mb-4 line-clamp-2">
        {app.shortDescription}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tags.map((tag, index) => (
          <span
            key={index}
            className="px-2 py-1 bg-purple-900/20 border border-purple-700/30 text-purple-300 text-xs rounded"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Social Links */}
      {(app.socialX ||
        app.socialTelegram ||
        app.socialFacebook ||
        app.socialTiktok) && (
        <div className="flex gap-3 mb-4">
          {app.socialX && (
            <a
              href={app.socialX}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 transition-colors"
              title="X (Twitter)"
            >
              <XTwitterIcon className="w-5 h-5" />
            </a>
          )}
          {app.socialTelegram && (
            <a
              href={app.socialTelegram}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 transition-colors"
              title="Telegram"
            >
              <TelegramIcon className="w-5 h-5" />
            </a>
          )}
          {app.socialFacebook && (
            <a
              href={app.socialFacebook}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 transition-colors"
              title="Facebook"
            >
              <FacebookIcon className="w-5 h-5" />
            </a>
          )}
          {app.socialTiktok && (
            <a
              href={app.socialTiktok}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 transition-colors"
              title="TikTok"
            >
              <TikTokIcon className="w-5 h-5" />
            </a>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-purple-900/30">
        <div className="text-xs text-gray-500">
          <p>Created: {formatDate(app.createdAt)}</p>
          {app.updatedAt !== app.createdAt && (
            <p>Updated: {formatDate(app.updatedAt)}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(app.appId)}
            className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-700/50 text-purple-300 rounded text-sm font-medium transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(app.appId)}
            className="px-4 py-2 bg-red-900/20 hover:bg-red-900/30 border border-red-700/50 text-red-400 rounded text-sm font-medium transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppCard;
