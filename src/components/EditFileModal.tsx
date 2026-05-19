import React, { useState, useEffect } from 'react';
import { Edit3, X, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface EditFileModalProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onSave: (newName: string) => void;
  isSaving: boolean;
}

export function EditFileModal({ isOpen, fileName, onClose, onSave, isSaving }: EditFileModalProps) {
  const [name, setName] = useState(fileName);

  useEffect(() => {
    setName(fileName);
  }, [fileName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name !== fileName) {
      onSave(name.trim());
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-[450px] bg-white rounded-[48px] shadow-2xl p-10 flex flex-col items-center overflow-hidden"
          >
            <div className="w-20 h-20 bg-indigo-50 rounded-[32px] flex items-center justify-center mb-8">
              <Edit3 className="w-10 h-10 text-indigo-600" />
            </div>

            <h2 className="text-2xl font-black text-gray-900 mb-8 uppercase tracking-tight">Đổi tên tài liệu</h2>
            
            <form onSubmit={handleSubmit} className="w-full space-y-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Tên hiển thị mới</label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#f8f9fc] border-none rounded-[24px] py-5 px-8 text-sm font-bold text-gray-700 focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  placeholder="Nhập tên tệp..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4 w-full">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="py-5 bg-white border-2 border-gray-100 text-gray-400 rounded-[24px] font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all active:scale-[0.98]"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !name.trim() || name === fileName}
                  className="py-5 bg-indigo-600 text-white rounded-[24px] font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Lưu thay đổi
                    </>
                  )}
                </button>
              </div>
            </form>
            
            <button 
              onClick={onClose}
              className="absolute top-8 right-8 text-gray-300 hover:text-gray-500 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
