import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { auth, db } from './firebase';
import './App.css';

// Lazy load the Login component to reduce initial bundle size
const Login = lazy(() => import('./Login'));

// Dark mode hook
const useDarkMode = () => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      return JSON.parse(saved);
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isDarkMode]);

  return [isDarkMode, setIsDarkMode];
};

const COLUMNS = {
  'todo': { id: 'todo', title: 'To-Do', color: 'var(--color-primary)' },
  'in-progress': { id: 'in-progress', title: 'In Progress', color: 'var(--color-accent-gold)' },
  'completed': { id: 'completed', title: 'Completed', color: 'var(--color-secondary)' }
};

const TAG_COLORS = [
  { name: 'Terracotta', value: '#c45c3e' },
  { name: 'Sage', value: '#81a87e' },
  { name: 'Gold', value: '#d4a857' },
  { name: 'Navy', value: '#3d4f5f' },
  { name: 'Rose', value: '#c47a7a' },
  { name: 'Lavender', value: '#8b7bb3' },
  { name: 'Teal', value: '#4a9b9b' },
  { name: 'Coral', value: '#e07a5f' },
];

const DATE_FILTERS = [
  { id: 'overdue', label: 'Overdue', icon: '⚠️' },
  { id: 'today', label: 'Today', icon: '📅' },
  { id: 'tomorrow', label: 'Tomorrow', icon: '📆' },
  { id: 'this-week', label: 'This Week', icon: '🗓️' },
  { id: 'upcoming', label: 'Upcoming', icon: '🔮' },
  { id: 'no-date', label: 'No Due Date', icon: '📭' },
];

// Date helper functions
const getStartOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
  return getEndOfDay(due) < getStartOfDay(new Date());
};

const isToday = (dueDate) => {
  if (!dueDate) return false;
  const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
  const today = new Date();
  return getStartOfDay(due).getTime() === getStartOfDay(today).getTime();
};

const isTomorrow = (dueDate) => {
  if (!dueDate) return false;
  const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getStartOfDay(due).getTime() === getStartOfDay(tomorrow).getTime();
};

const isThisWeek = (dueDate) => {
  if (!dueDate) return false;
  const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
  const today = new Date();
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
  return due >= getStartOfDay(today) && due <= getEndOfDay(endOfWeek);
};

const isUpcoming = (dueDate) => {
  if (!dueDate) return false;
  const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
  const today = new Date();
  // Future dates that are not today (tomorrow and beyond)
  return getStartOfDay(due) > getStartOfDay(today);
};

const formatDueDate = (dueDate) => {
  if (!dueDate) return null;
  const due = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (isOverdue(dueDate)) {
    return { text: 'Overdue', class: 'overdue' };
  }
  if (isToday(dueDate)) {
    return { text: 'Today', class: 'today' };
  }
  if (isTomorrow(dueDate)) {
    return { text: 'Tomorrow', class: 'tomorrow' };
  }
  return { 
    text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), 
    class: 'future' 
  };
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [tags, setTags] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [selectedTaskTags, setSelectedTaskTags] = useState([]);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [dropPosition, setDropPosition] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedFilterTags, setSelectedFilterTags] = useState([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0].value);
  const [editingTask, setEditingTask] = useState(null);
  const [editingTaskDetails, setEditingTaskDetails] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState(null);
  const [isDarkMode, setIsDarkMode] = useDarkMode();
  const dragCounter = useRef({});

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load tasks from Firestore
  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    const unsubscribe = db
      .collection('users')
      .doc(user.uid)
      .collection('tasks')
      .orderBy('order', 'asc')
      .onSnapshot((snapshot) => {
        const tasksData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        setTasks(tasksData);
      });

    return () => unsubscribe();
  }, [user]);

  // Load tags from Firestore
  useEffect(() => {
    if (!user) {
      setTags([]);
      return;
    }

    const unsubscribe = db
      .collection('users')
      .doc(user.uid)
      .collection('tags')
      .orderBy('createdAt', 'asc')
      .onSnapshot((snapshot) => {
        const tagsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        setTags(tagsData);
      });

    return () => unsubscribe();
  }, [user]);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleSignIn = (signedInUser) => {
    setUser(signedInUser);
  };

  const getNextOrder = (columnId) => {
    const columnTasks = tasks.filter(t => t.status === columnId);
    if (columnTasks.length === 0) return 1000;
    const maxOrder = Math.max(...columnTasks.map(t => t.order || 0));
    return maxOrder + 1000;
  };

  // Tag Management
  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    try {
      await db
        .collection('users')
        .doc(user.uid)
        .collection('tags')
        .add({
          name: newTagName.trim(),
          color: newTagColor,
          createdAt: new Date()
        });

      setNewTagName('');
      setNewTagColor(TAG_COLORS[0].value);
      setShowTagModal(false);
    } catch (error) {
      console.error('Error creating tag:', error);
    }
  };

  const handleDeleteTag = async (tagId) => {
    try {
      // Delete the tag
      await db
        .collection('users')
        .doc(user.uid)
        .collection('tags')
        .doc(tagId)
        .delete();

      // Remove tag from all tasks that have it
      const batch = db.batch();
      tasks.forEach(task => {
        if (task.tags && task.tags.includes(tagId)) {
          const taskRef = db
            .collection('users')
            .doc(user.uid)
            .collection('tasks')
            .doc(task.id);
          batch.update(taskRef, {
            tags: task.tags.filter(t => t !== tagId)
          });
        }
      });
      await batch.commit();

      // Remove from filter if selected
      setSelectedFilterTags(prev => prev.filter(t => t !== tagId));
    } catch (error) {
      console.error('Error deleting tag:', error);
    }
  };

  const toggleFilterTag = (tagId) => {
    setSelectedFilterTags(prev =>
      prev.includes(tagId)
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  };

  const clearFilters = () => {
    setSelectedFilterTags([]);
  };

  // Task Management
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const taskData = {
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim(),
        status: 'todo',
        order: getNextOrder('todo'),
        tags: selectedTaskTags,
        createdAt: new Date()
      };
      
      if (newTaskDueDate) {
        taskData.dueDate = new Date(newTaskDueDate);
      }

      await db
        .collection('users')
        .doc(user.uid)
        .collection('tasks')
        .add(taskData);

      setNewTaskTitle('');
      setNewTaskDescription('');
      setSelectedTaskTags([]);
      setNewTaskDueDate('');
      setShowModal(false);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await db
        .collection('users')
        .doc(user.uid)
        .collection('tasks')
        .doc(taskId)
        .delete();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const handleUpdateTaskTags = async (taskId, newTags) => {
    try {
      await db
        .collection('users')
        .doc(user.uid)
        .collection('tasks')
        .doc(taskId)
        .update({ tags: newTags });
    } catch (error) {
      console.error('Error updating task tags:', error);
    }
  };

  const toggleTaskTag = (tagId) => {
    setSelectedTaskTags(prev =>
      prev.includes(tagId)
        ? prev.filter(t => t !== tagId)
        : [...prev, tagId]
    );
  };

  const openEditTagsModal = (task) => {
    setEditingTask(task);
    setSelectedTaskTags(task.tags || []);
  };

  const saveEditedTaskTags = async () => {
    if (editingTask) {
      await handleUpdateTaskTags(editingTask.id, selectedTaskTags);
      setEditingTask(null);
      setSelectedTaskTags([]);
    }
  };

  // Edit Task Details
  const openEditDetailsModal = (task) => {
    setEditingTaskDetails(task);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    // Convert Firestore timestamp to date string for input
    if (task.dueDate) {
      const due = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate);
      setEditDueDate(due.toISOString().split('T')[0]);
    } else {
      setEditDueDate('');
    }
  };

  const closeEditDetailsModal = () => {
    setEditingTaskDetails(null);
    setEditTitle('');
    setEditDescription('');
    setEditDueDate('');
  };

  const handleUpdateTaskDetails = async (e) => {
    e.preventDefault();
    if (!editingTaskDetails || !editTitle.trim()) return;

    try {
      const updateData = {
        title: editTitle.trim(),
        description: editDescription.trim()
      };
      
      if (editDueDate) {
        updateData.dueDate = new Date(editDueDate);
      } else {
        // Remove due date if cleared
        updateData.dueDate = null;
      }

      await db
        .collection('users')
        .doc(user.uid)
        .collection('tasks')
        .doc(editingTaskDetails.id)
        .update(updateData);
      closeEditDetailsModal();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  // Drag and Drop
  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', task.id);
    setTimeout(() => {
      e.target.classList.add('dragging');
    }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.classList.remove('dragging');
    setDraggedTask(null);
    setDragOverColumn(null);
    setDropTargetId(null);
    setDropPosition(null);
    dragCounter.current = {};
  };

  const handleColumnDragEnter = (e, columnId) => {
    e.preventDefault();
    dragCounter.current[columnId] = (dragCounter.current[columnId] || 0) + 1;
    setDragOverColumn(columnId);
  };

  const handleColumnDragLeave = (e, columnId) => {
    dragCounter.current[columnId] = (dragCounter.current[columnId] || 0) - 1;
    if (dragCounter.current[columnId] <= 0) {
      dragCounter.current[columnId] = 0;
      if (dragOverColumn === columnId) {
        setDragOverColumn(null);
      }
    }
  };

  const handleColumnDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleTaskDragOver = (e, task) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedTask || draggedTask.id === task.id) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const position = e.clientY < midPoint ? 'before' : 'after';
    
    setDropTargetId(task.id);
    setDropPosition(position);
  };

  const handleTaskDragLeave = (e) => {
    const relatedTarget = e.relatedTarget;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropTargetId(null);
      setDropPosition(null);
    }
  };

  const calculateNewOrder = (columnId, targetTaskId, position) => {
    const columnTasks = tasks
      .filter(t => t.status === columnId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    
    if (!targetTaskId) {
      return getNextOrder(columnId);
    }

    const targetIndex = columnTasks.findIndex(t => t.id === targetTaskId);
    if (targetIndex === -1) return getNextOrder(columnId);

    const targetTask = columnTasks[targetIndex];
    
    if (position === 'before') {
      if (targetIndex === 0) {
        return (targetTask.order || 1000) / 2;
      }
      const prevTask = columnTasks[targetIndex - 1];
      return ((prevTask.order || 0) + (targetTask.order || 0)) / 2;
    } else {
      if (targetIndex === columnTasks.length - 1) {
        return (targetTask.order || 0) + 1000;
      }
      const nextTask = columnTasks[targetIndex + 1];
      return ((targetTask.order || 0) + (nextTask.order || 0)) / 2;
    }
  };

  const handleDrop = async (e, columnId) => {
    e.preventDefault();
    
    if (!draggedTask) return;

    const targetTaskId = dropTargetId;
    const position = dropPosition;
    
    setDragOverColumn(null);
    setDropTargetId(null);
    setDropPosition(null);
    dragCounter.current = {};

    const newOrder = calculateNewOrder(columnId, targetTaskId, position);
    
    if (draggedTask.status === columnId && !targetTaskId) {
      return;
    }

    try {
      await db
        .collection('users')
        .doc(user.uid)
        .collection('tasks')
        .doc(draggedTask.id)
        .update({
          status: columnId,
          order: newOrder
        });
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const getTasksByColumn = (columnId) => {
    let filteredTasks = tasks.filter((task) => task.status === columnId);
    
    // Apply tag filter
    if (selectedFilterTags.length > 0) {
      filteredTasks = filteredTasks.filter(task =>
        task.tags && task.tags.some(tagId => selectedFilterTags.includes(tagId))
      );
    }
    
    // Apply date filter
    if (selectedDateFilter) {
      filteredTasks = filteredTasks.filter(task => {
        switch (selectedDateFilter) {
          case 'overdue':
            return isOverdue(task.dueDate);
          case 'today':
            return isToday(task.dueDate);
          case 'tomorrow':
            return isTomorrow(task.dueDate);
          case 'this-week':
            return isThisWeek(task.dueDate);
          case 'upcoming':
            return isUpcoming(task.dueDate);
          case 'no-date':
            return !task.dueDate;
          default:
            return true;
        }
      });
    }
    
    return filteredTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  const getDateFilterCount = (filterId) => {
    return tasks.filter(task => {
      if (task.status === 'completed') return false; // Don't count completed tasks
      switch (filterId) {
        case 'overdue':
          return isOverdue(task.dueDate);
        case 'today':
          return isToday(task.dueDate);
        case 'tomorrow':
          return isTomorrow(task.dueDate);
        case 'this-week':
          return isThisWeek(task.dueDate);
        case 'upcoming':
          return isUpcoming(task.dueDate);
        case 'no-date':
          return !task.dueDate;
        default:
          return false;
      }
    }).length;
  };

  const getTagById = (tagId) => tags.find(t => t.id === tagId);

  // Show loading state
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return (
      <Suspense fallback={
        <div className="loading-screen">
          <div className="loading-content">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      }>
        <Login onSignIn={handleSignIn} />
      </Suspense>
    );
  }

  // Main app content when authenticated
  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <button 
              className="sidebar-toggle" 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="header-title">
              <div className="app-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path 
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h1>My Tasks</h1>
            </div>
          </div>
          <div className="header-user">
            <button
              className="theme-toggle"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <span className="user-greeting">
              Hello, {user.displayName || user.email?.split('@')[0]}
            </span>
            <button className="btn btn-ghost" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="app-layout">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-content">
            <div className="sidebar-section">
              <div className="sidebar-section-header">
                <h3>Tags</h3>
                <button 
                  className="btn-icon" 
                  onClick={() => setShowTagModal(true)}
                  title="Create new tag"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
              
              {tags.length === 0 ? (
                <p className="sidebar-empty">No tags yet. Create one to organize your tasks!</p>
              ) : (
                <div className="tag-list">
                  {tags.map(tag => (
                    <div 
                      key={tag.id} 
                      className={`tag-item ${selectedFilterTags.includes(tag.id) ? 'active' : ''}`}
                    >
                      <button 
                        className="tag-filter-btn"
                        onClick={() => toggleFilterTag(tag.id)}
                      >
                        <span 
                          className="tag-color" 
                          style={{ backgroundColor: tag.color }}
                        ></span>
                        <span className="tag-name">{tag.name}</span>
                        <span className="tag-task-count">
                          {tasks.filter(t => t.tags?.includes(tag.id)).length}
                        </span>
                      </button>
                      <button 
                        className="tag-delete-btn"
                        onClick={() => handleDeleteTag(tag.id)}
                        title="Delete tag"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {selectedFilterTags.length > 0 && (
                <button className="clear-filters-btn" onClick={clearFilters}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Clear tag filters
                </button>
              )}
            </div>

            {/* Due Dates Section */}
            <div className="sidebar-section">
              <div className="sidebar-section-header">
                <h3>Due Dates</h3>
              </div>
              
              <div className="date-filter-list">
                {DATE_FILTERS.map(filter => {
                  const count = getDateFilterCount(filter.id);
                  return (
                    <button
                      key={filter.id}
                      className={`date-filter-item ${selectedDateFilter === filter.id ? 'active' : ''} ${filter.id === 'overdue' && count > 0 ? 'has-overdue' : ''}`}
                      onClick={() => setSelectedDateFilter(
                        selectedDateFilter === filter.id ? null : filter.id
                      )}
                    >
                      <span className="date-filter-icon">{filter.icon}</span>
                      <span className="date-filter-label">{filter.label}</span>
                      <span className={`date-filter-count ${filter.id === 'overdue' && count > 0 ? 'overdue' : ''}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {selectedDateFilter && (
                <button 
                  className="clear-filters-btn" 
                  onClick={() => setSelectedDateFilter(null)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Clear date filter
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="app-main">
          <div className="board-header">
            {(selectedFilterTags.length > 0 || selectedDateFilter) && (
              <div className="active-filters">
                <span>Filtering by:</span>
                {selectedFilterTags.map(tagId => {
                  const tag = getTagById(tagId);
                  return tag ? (
                    <span 
                      key={tagId} 
                      className="filter-tag"
                      style={{ '--tag-color': tag.color }}
                    >
                      {tag.name}
                    </span>
                  ) : null;
                })}
                {selectedDateFilter && (
                  <span className="filter-tag filter-tag-date">
                    {DATE_FILTERS.find(f => f.id === selectedDateFilter)?.icon}{' '}
                    {DATE_FILTERS.find(f => f.id === selectedDateFilter)?.label}
                  </span>
                )}
              </div>
            )}
            <button className="btn btn-primary add-task-btn" onClick={() => setShowModal(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              New Task
            </button>
          </div>

          <div className="kanban-board">
            {Object.values(COLUMNS).map((column) => (
              <div
                key={column.id}
                className={`kanban-column ${dragOverColumn === column.id ? 'drag-over' : ''}`}
                onDragEnter={(e) => handleColumnDragEnter(e, column.id)}
                onDragLeave={(e) => handleColumnDragLeave(e, column.id)}
                onDragOver={handleColumnDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
              >
                <div className="column-header" style={{ '--column-color': column.color }}>
                  <div className="column-indicator"></div>
                  <h3>{column.title}</h3>
                  <span className="task-count">{getTasksByColumn(column.id).length}</span>
                </div>
                <div className="column-tasks">
                  {getTasksByColumn(column.id).map((task) => (
                    <div
                      key={task.id}
                      className={`task-card ${
                        dropTargetId === task.id ? `drop-target drop-${dropPosition}` : ''
                      } ${draggedTask?.id === task.id ? 'is-dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleTaskDragOver(e, task)}
                      onDragLeave={handleTaskDragLeave}
                    >
                      <div className="task-card-header">
                        <h4 className="task-title">{task.title}</h4>
                        <div className="task-actions">
                          <button 
                            className="task-action-btn" 
                            onClick={() => openEditDetailsModal(task)}
                            title="Edit task"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button 
                            className="task-action-btn" 
                            onClick={() => openEditTagsModal(task)}
                            title="Edit tags"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button 
                            className="task-action-btn task-delete-btn" 
                            onClick={() => handleDeleteTask(task.id)}
                            title="Delete task"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      {task.description && (
                        <p className="task-description">{task.description}</p>
                      )}
                      {task.tags && task.tags.length > 0 && (
                        <div className="task-tags">
                          {task.tags.map(tagId => {
                            const tag = getTagById(tagId);
                            return tag ? (
                              <span 
                                key={tagId} 
                                className="task-tag"
                                style={{ '--tag-color': tag.color }}
                              >
                                {tag.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                      {task.dueDate && (
                        <div className={`task-due-date ${formatDueDate(task.dueDate)?.class || ''}`}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                            <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
                          {formatDueDate(task.dueDate)?.text}
                        </div>
                      )}
                    </div>
                  ))}
                  {getTasksByColumn(column.id).length === 0 && (
                    <div className="empty-column">
                      <p>No tasks here</p>
                      <span>Drag tasks here or create new ones</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* Modal for creating new task */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Task</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="form-group">
                <label htmlFor="taskTitle">Task Title</label>
                <input
                  type="text"
                  id="taskTitle"
                  className="input"
                  placeholder="What needs to be done?"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="taskDescription">Description (optional)</label>
                <textarea
                  id="taskDescription"
                  className="input textarea"
                  placeholder="Add more details..."
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  rows="3"
                />
              </div>
              {tags.length > 0 && (
                <div className="form-group">
                  <label>Tags</label>
                  <div className="tag-selector">
                    {tags.map(tag => (
                      <button
                        key={tag.id}
                        type="button"
                        className={`tag-option ${selectedTaskTags.includes(tag.id) ? 'selected' : ''}`}
                        style={{ '--tag-color': tag.color }}
                        onClick={() => toggleTaskTag(tag.id)}
                      >
                        <span className="tag-option-color"></span>
                        {tag.name}
                        {selectedTaskTags.includes(tag.id) && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="taskDueDate">Due Date (optional)</label>
                <input
                  type="date"
                  id="taskDueDate"
                  className="input date-input"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!newTaskTitle.trim()}>
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for creating new tag */}
      {showTagModal && (
        <div className="modal-overlay" onClick={() => setShowTagModal(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Tag</h2>
              <button className="modal-close" onClick={() => setShowTagModal(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleCreateTag}>
              <div className="form-group">
                <label htmlFor="tagName">Tag Name</label>
                <input
                  type="text"
                  id="tagName"
                  className="input"
                  placeholder="e.g., Work, Personal, Urgent"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Color</label>
                <div className="color-picker">
                  {TAG_COLORS.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      className={`color-option ${newTagColor === color.value ? 'selected' : ''}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setNewTagColor(color.value)}
                      title={color.name}
                    >
                      {newTagColor === color.value && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17l-5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="tag-preview">
                <span>Preview:</span>
                <span 
                  className="task-tag" 
                  style={{ '--tag-color': newTagColor }}
                >
                  {newTagName || 'Tag name'}
                </span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTagModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!newTagName.trim()}>
                  Create Tag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal for editing task tags */}
      {editingTask && (
        <div className="modal-overlay" onClick={() => { setEditingTask(null); setSelectedTaskTags([]); }}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Tags</h2>
              <button className="modal-close" onClick={() => { setEditingTask(null); setSelectedTaskTags([]); }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="editing-task-title">{editingTask.title}</p>
              {tags.length === 0 ? (
                <p className="sidebar-empty">No tags created yet. Create tags in the sidebar first!</p>
              ) : (
                <div className="tag-selector">
                  {tags.map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`tag-option ${selectedTaskTags.includes(tag.id) ? 'selected' : ''}`}
                      style={{ '--tag-color': tag.color }}
                      onClick={() => toggleTaskTag(tag.id)}
                    >
                      <span className="tag-option-color"></span>
                      {tag.name}
                      {selectedTaskTags.includes(tag.id) && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setEditingTask(null); setSelectedTaskTags([]); }}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={saveEditedTaskTags}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for editing task details */}
      {editingTaskDetails && (
        <div className="modal-overlay" onClick={closeEditDetailsModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Task</h2>
              <button className="modal-close" onClick={closeEditDetailsModal}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <form onSubmit={handleUpdateTaskDetails}>
              <div className="form-group">
                <label htmlFor="editTaskTitle">Task Title</label>
                <input
                  type="text"
                  id="editTaskTitle"
                  className="input"
                  placeholder="What needs to be done?"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="editTaskDescription">Description (optional)</label>
                <textarea
                  id="editTaskDescription"
                  className="input textarea"
                  placeholder="Add more details..."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label htmlFor="editTaskDueDate">Due Date (optional)</label>
                <input
                  type="date"
                  id="editTaskDueDate"
                  className="input date-input"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeEditDetailsModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!editTitle.trim()}>
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
