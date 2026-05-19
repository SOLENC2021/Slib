import React from 'react';
import { Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  fileName: string;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteConfirmModal({ isOpen, fileName, onClose, onConfirm, isDeleting }: DeleteConfirmModalProps) {
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
            className="relative w-full max-w-[400px] bg-white rounded-[48px] shadow-2xl p-10 flex flex-col items-center text-center overflow-hidden"
          >
            <div className="w-20 h-20 bg-red-50 rounded-[32px] flex items-center justify-center mb-8">
              <Trash2 className="w-10 h-10 text-red-500" />
            </div>

            <h2 className="text-2xl font-black text-gray-900 mb-4">Xác nhận xóa tệp?</h2>
            
            <p className="text-gray-500 text-sm font-bold leading-relaxed mb-10 px-4">
              Hành động này sẽ xóa vĩnh viễn tệp <span className="text-gray-900">"{fileName}"</span> và các dữ liệu AI đã trích xuất.
            </p>

            <div className="grid grid-cols-2 gap-4 w-full">
              <button
                onClick={onClose}
                disabled={isDeleting}
                className="py-5 bg-white border-2 border-gray-100 text-gray-400 rounded-[24px] font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all active:scale-[0.98]"
              >
                Hủy bỏ
              </button>
              <button
                onClick={onConfirm}
                disabled={isDeleting}
                className="py-5 bg-red-500 text-white rounded-[24px] font-black text-xs uppercase tracking-widest shadow-xl shadow-red-500/20 hover:bg-red-600 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Xác nhận xóa"
                )}
              </button>
            </div>
            
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
