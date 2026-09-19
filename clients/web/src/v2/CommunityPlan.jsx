import React, { useState } from 'react';

export default function CommunityPlan() {
 const [speakerId, setSpeakerId] = useState('speaker2');
 const speakers = ['speaker1', 'speaker2', 'speaker3'];

 return (
 <div className="v2-app p-8">
 <header className="v2-header">
 <h1 className="text-4xl font-bold">Community Plan</h1>
 <p className="text-v2-muted">One paid owner • multiple speaker users</p>
 </header>

 <div className="max-w-5xl mx-auto">
 <div className="v2-card">
 <h2 className="text-2xl font-bold mb-2">Owner: speaker1 (paid)</h2>
 <p className="text-v2-muted mb-8 text-sm">Plan: community • Status: active</p>

 <div className="max-w-2xl">
 <label htmlFor="addSpeakerInput" className="v2-label">Add speaker user id</label>
 <div className="flex gap-4 mb-12">
 <input 
 id="addSpeakerInput"
 name="speakerId"
 type="text" className="v2-input flex-1" 
 value={speakerId} onChange={(e) => setSpeakerId(e.target.value)} 
 />
 <button className="v2-btn">Add speaker</button>
 </div>

 <p className="v2-label mb-4">Speakers on this plan:</p>
 <div className="space-y-4">
 {speakers.map(s => (
 <div key={s} className="p-6 bg-white border border-v2-border rounded-md">
 <p className="text-xl font-bold">{s}</p>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 </div>
 );
}
