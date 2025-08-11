import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProjectSelection from './pages/ProjectSelection';
import MergedParts from './pages/MergedParts';
import MergedProjectList from './pages/MergedProjectList';
import MergedProjectParts from './pages/MergedProjectParts';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<ProjectSelection />} />
          <Route path="/merged-parts" element={<MergedParts />} />
          <Route path="/merged-projects" element={<MergedProjectList />} />
          <Route path="/merged-project-parts/:mergedProjectId" element={<MergedProjectParts />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;