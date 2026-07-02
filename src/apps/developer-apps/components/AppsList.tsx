import React from 'react';
import { useNavigate } from 'react-router-dom';

// api
import { useGetAllDeveloperAppsQuery, useDeleteDeveloperAppMutation, useUpdateDeveloperAppMutation } from '../api/developerAppsApi';
import { useAuthAccount } from '../../../hooks/useAuthAccount';

// components
import AppCard from './AppCard';

// icons
import LockIcon from '../assets/icons/lock.svg?react';
import ErrorIcon from '../assets/icons/error.svg?react';
import CubeIcon from '../assets/icons/cube.svg?react';

const AppsList: React.FC = () => {
  const navigate = useNavigate();
  const { walletAddress: eoaAddress } = useAuthAccount();

  const { data, isLoading, error } = useGetAllDeveloperAppsQuery({ eoaAddress });
  const [deleteApp, { isLoading: isDeleting }] = useDeleteDeveloperAppMutation();
  const [updateApp] = useUpdateDeveloperAppMutation();

  const myApps = React.useMemo(() => {
    if (!data?.data || !eoaAddress) return [];
    return data.data.filter((app) => {
      if (!app.ownerEoaAddress || !eoaAddress) return false;
      return app.ownerEoaAddress.toLowerCase() === eoaAddress.toLowerCase();
    });
  }, [data, eoaAddress]);

  const handleEdit = (appId: string) => {
    navigate(`/developer-apps/edit/${appId}`);
  };

  const handleDelete = async (appId: string) => {
    if (!eoaAddress) {
      alert('Wallet not connected');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete this app? This action cannot be undone.'
    );

    if (!confirmed) return;

    try {
      await deleteApp({
        appId,
        data: { ownerEoaAddress: eoaAddress },
      }).unwrap();
    } catch (err: unknown) {
      console.error('Failed to delete app:', err);
      const errorMessage = err && typeof err === 'object' && 'data' in err 
        ? (err.data as { error?: string })?.error || 'Failed to delete app'
        : 'Failed to delete app';
      alert(errorMessage);
    }
  };

  const handleCreateNew = () => {
    navigate('/developer-apps/create');
  };

  const handleSendForReview = async (appId: string) => {
    if (!eoaAddress) {
      alert('Wallet not connected');
      return;
    }

    try {
      await updateApp({
        appId,
        data: {
          ownerEoaAddress: eoaAddress,
          isInReview: true,
        },
      }).unwrap();
    } catch (err: unknown) {
      console.error('Failed to send app for review:', err);
      const errorMessage = err && typeof err === 'object' && 'data' in err 
        ? (err.data as { error?: string })?.error || 'Failed to send app for review'
        : 'Failed to send app for review';
      alert(errorMessage);
    }
  };

  if (!eoaAddress) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-20 h-20 mb-6 rounded-full bg-purple-900/20 border border-purple-700/30 flex items-center justify-center">
          <LockIcon className="w-10 h-10 text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-gray-400 max-w-md">
          Please connect your wallet to view and manage your developer applications.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-purple-400 font-mono">Loading your apps...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mb-6 rounded-full bg-red-900/20 border border-red-700/30 flex items-center justify-center mx-auto">
            <ErrorIcon className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Error Loading Apps</h2>
          <p className="text-gray-400">Failed to load your applications. Please try again.</p>
        </div>
      </div>
    );
  }

  if (myApps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-br from-purple-900/20 to-purple-800/20 border border-purple-700/30 flex items-center justify-center">
          <CubeIcon className="w-12 h-12 text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No Apps Yet</h2>
        <p className="text-gray-400 mb-6 max-w-md">
          You haven't registered any apps yet. Get started by creating your first application.
        </p>
        <button
          onClick={handleCreateNew}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-lg font-medium transition-all duration-300 shadow-lg shadow-purple-900/50"
        >
          Create Your First App
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">My Applications</h1>
          <p className="text-gray-400">
            Manage your {myApps.length} {myApps.length === 1 ? 'application' : 'applications'}
          </p>
        </div>
        <button
          onClick={handleCreateNew}
          disabled={isDeleting}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white rounded-lg font-medium transition-all duration-300 shadow-lg shadow-purple-900/50 disabled:opacity-50"
        >
          + Create New App
        </button>
      </div>

      {/* Apps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {myApps.map((app) => (
          <AppCard
            key={app.appId}
            app={app}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSendForReview={handleSendForReview}
          />
        ))}
      </div>
    </div>
  );
};

export default AppsList;
