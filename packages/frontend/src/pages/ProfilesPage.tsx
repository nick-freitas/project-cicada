import { useState } from 'react';

type ProfileType = 'CHARACTER' | 'LOCATION' | 'EPISODE' | 'FRAGMENT_GROUP' | 'THEORY';

const PROFILE_TYPES: { value: ProfileType; label: string }[] = [
  { value: 'CHARACTER', label: 'Characters' },
  { value: 'LOCATION', label: 'Locations' },
  { value: 'EPISODE', label: 'Episodes' },
  { value: 'FRAGMENT_GROUP', label: 'Fragment Groups' },
  { value: 'THEORY', label: 'Theories' },
];

export function ProfilesPage() {
  const [selectedType, setSelectedType] = useState<ProfileType>('CHARACTER');

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Profile Management</h2>
        <p className="text-gray-600">
          View and manage your accumulated knowledge about characters, locations, episodes, and theories.
        </p>
      </div>

      {/* Profile type tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {PROFILE_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => setSelectedType(type.value)}
              className={`${
                selectedType === type.value
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
            >
              {type.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Profile list */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="text-center py-12">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No {selectedType.toLowerCase()} profiles</h3>
            <p className="mt-1 text-sm text-gray-500">
              Profiles will be created automatically as you chat with CICADA.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
