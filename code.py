import cv2
import pytesseract
import numpy as np
import pandas as pd
from PIL import Image, ImageTk
import os
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import customtkinter as ctk
from typing import List, Tuple, Optional

class ImageToExcelApp:
    def __init__(self, master):
        self.master = master
        master.title("محول الصور إلى Excel")
        master.geometry("900x700")
        
        # تحميل أيقونة البرنامج
        try:
            master.iconbitmap("icon.ico")  # يمكنك استبدالها بأيقونتك الخاصة
        except:
            pass
        
        # إعداد الواجهة
        self.setup_ui()
        
        # تكوين Tesseract
        pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'  # تعديل المسار حسب نظامك
        
        # متغيرات البرنامج
        self.image_path = ""
        self.processed_image = None
        self.output_path = ""
        
    def setup_ui(self):
        """تهيئة واجهة المستخدم"""
        # إعداد المظهر
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")
        
        # إنشاء إطار رئيسي
        self.main_frame = ctk.CTkFrame(self.master)
        self.main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # قسم العنوان
        self.title_label = ctk.CTkLabel(
            self.main_frame,
            text="محول الجداول من الصور إلى Excel",
            font=("Arial", 20, "bold")
        )
        self.title_label.pack(pady=(10, 20))
        
        # قسم تحميل الصورة
        self.load_frame = ctk.CTkFrame(self.main_frame)
        self.load_frame.pack(fill=tk.X, padx=10, pady=5)
        
        self.load_btn = ctk.CTkButton(
            self.load_frame,
            text="اختر صورة",
            command=self.load_image,
            width=120,
            height=40,
            font=("Arial", 14)
        )
        self.load_btn.pack(side=tk.LEFT, padx=5)
        
        self.image_path_label = ctk.CTkLabel(
            self.load_frame,
            text="لم يتم اختيار صورة",
            font=("Arial", 12),
            anchor="w"
        )
        self.image_path_label.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        # قسم معاينة الصورة
        self.preview_frame = ctk.CTkFrame(self.main_frame)
        self.preview_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.original_label = ctk.CTkLabel(
            self.preview_frame,
            text="الصورة الأصلية",
            font=("Arial", 14)
        )
        self.original_label.grid(row=0, column=0, padx=5, pady=5)
        
        self.processed_label = ctk.CTkLabel(
            self.preview_frame,
            text="الصورة المعالجة",
            font=("Arial", 14)
        )
        self.processed_label.grid(row=0, column=1, padx=5, pady=5)
        
        self.original_canvas = tk.Canvas(
            self.preview_frame,
            width=400,
            height=300,
            bg="#f0f0f0",
            bd=2,
            relief="ridge"
        )
        self.original_canvas.grid(row=1, column=0, padx=5, pady=5)
        
        self.processed_canvas = tk.Canvas(
            self.preview_frame,
            width=400,
            height=300,
            bg="#f0f0f0",
            bd=2,
            relief="ridge"
        )
        self.processed_canvas.grid(row=1, column=1, padx=5, pady=5)
        
        # قسم التحكم
        self.control_frame = ctk.CTkFrame(self.main_frame)
        self.control_frame.pack(fill=tk.X, padx=10, pady=10)
        
        self.process_btn = ctk.CTkButton(
            self.control_frame,
            text="معالجة الصورة",
            command=self.process_image,
            state=tk.DISABLED,
            width=120,
            height=40,
            font=("Arial", 14)
        )
        self.process_btn.pack(side=tk.LEFT, padx=5)
        
        self.export_btn = ctk.CTkButton(
            self.control_frame,
            text="تصدير إلى Excel",
            command=self.export_to_excel,
            state=tk.DISABLED,
            width=120,
            height=40,
            font=("Arial", 14)
        )
        self.export_btn.pack(side=tk.LEFT, padx=5)
        
        # شريط التقدم
        self.progress = ttk.Progressbar(
            self.control_frame,
            orient=tk.HORIZONTAL,
            length=200,
            mode='determinate'
        )
        self.progress.pack(side=tk.LEFT, padx=10, fill=tk.X, expand=True)
        
        # قسم النتائج
        self.result_frame = ctk.CTkFrame(self.main_frame)
        self.result_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.result_text = tk.Text(
            self.result_frame,
            wrap=tk.WORD,
            font=("Arial", 12),
            bg="#f8f9fa",
            padx=10,
            pady=10
        )
        self.result_text.pack(fill=tk.BOTH, expand=True)
        
        # شريط التمرير
        scrollbar = ttk.Scrollbar(self.result_text)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.result_text.config(yscrollcommand=scrollbar.set)
        scrollbar.config(command=self.result_text.yview)
        
    def load_image(self):
        """تحميل صورة من ملف"""
        filetypes = (
            ("ملفات الصور", "*.jpg *.jpeg *.png"),
            ("جميع الملفات", "*.*")
        )
        
        self.image_path = filedialog.askopenfilename(
            title="اختر صورة",
            filetypes=filetypes
        )
        
        if self.image_path:
            self.image_path_label.configure(text=self.image_path)
            self.display_original_image()
            self.process_btn.configure(state=tk.NORMAL)
            self.export_btn.configure(state=tk.DISABLED)
            self.result_text.delete(1.0, tk.END)
    
    def display_original_image(self):
        """عرض الصورة الأصلية"""
        try:
            img = Image.open(self.image_path)
            img.thumbnail((400, 300))
            
            self.original_photo = ImageTk.PhotoImage(img)
            self.original_canvas.create_image(
                200, 150,
                image=self.original_photo
            )
        except Exception as e:
            messagebox.showerror("خطأ", f"لا يمكن عرض الصورة: {str(e)}")
    
    def process_image(self):
        """معالجة الصورة لاكتشاف الجداول"""
        if not self.image_path:
            return
            
        try:
            self.progress.start()
            self.result_text.delete(1.0, tk.END)
            self.result_text.insert(tk.END, "جاري معالجة الصورة...\n")
            self.master.update()
            
            # تحميل الصورة
            image = cv2.imread(self.image_path)
            
            # معالجة الصورة
            processed_img = self.enhance_image(image)
            table_regions = self.detect_tables(processed_img)
            
            if not table_regions:
                messagebox.showwarning("تحذير", "لم يتم اكتشاف أي جداول في الصورة")
                return
            
            # عرض الصورة المعالجة
            self.display_processed_image(processed_img, table_regions)
            
            # استخراج الجداول
            self.result_text.insert(tk.END, f"تم اكتشاف {len(table_regions)} جدول(جداول)\n\n")
            
            self.tables = []
            for i, region in enumerate(table_regions, 1):
                self.result_text.insert(tk.END, f"جاري معالجة الجدول {i}...\n")
                self.master.update()
                
                table_df = self.extract_table(processed_img, region)
                self.tables.append(table_df)
                self.result_text.insert(tk.END, f"تم استخراج الجدول {i} ({table_df.shape[0]} صفوف، {table_df.shape[1]} أعمدة)\n")
            
            self.result_text.insert(tk.END, "\nانتهت المعالجة بنجاح!\n")
            self.export_btn.configure(state=tk.NORMAL)
            
        except Exception as e:
            messagebox.showerror("خطأ", f"حدث خطأ أثناء المعالجة: {str(e)}")
        finally:
            self.progress.stop()
    
    def enhance_image(self, image: np.ndarray) -> np.ndarray:
        """تحسين جودة الصورة"""
        # تحويل إلى تدرج الرمادي
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # تحسين التباين باستخدام CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # إزالة الضوضاء
        denoised = cv2.fastNlMeansDenoising(enhanced, h=10)
        
        # العتبة التكيفية
        thresh = cv2.adaptiveThreshold(
            denoised, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 11, 2
        )
        
        return thresh
    
    def detect_tables(self, image: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """اكتشاف الجداول في الصورة"""
        # اكتشاف الخطوط
        edges = cv2.Canny(image, 50, 150, apertureSize=3)
        lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=100, maxLineGap=10)
        
        if lines is None:
            return []
        
        # رسم الخطوط على صورة فارغة
        line_image = np.zeros_like(image)
        for line in lines:
            x1, y1, x2, y2 = line[0]
            cv2.line(line_image, (x1, y1), (x2, y2), 255, 2)
        
        # العثور على الملامح
        contours, _ = cv2.findContours(line_image, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # تصفية الملامح الكبيرة
        tables = []
        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            if w > image.shape[1] * 0.3 and h > image.shape[0] * 0.1:
                tables.append((x, y, x+w, y+h))
        
        return tables
    
    def display_processed_image(self, image: np.ndarray, tables: List[Tuple[int, int, int, int]]):
        """عرض الصورة المعالجة مع تحديد الجداول"""
        # تحويل الصورة المعالجة إلى RGB للعرض
        display_img = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
        
        # رسم مستطيلات حول الجداول المكتشفة
        for (x1, y1, x2, y2) in tables:
            cv2.rectangle(display_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        
        # تحويل إلى صورة PIL
        pil_img = Image.fromarray(display_img)
        pil_img.thumbnail((400, 300))
        
        # عرض الصورة
        self.processed_photo = ImageTk.PhotoImage(pil_img)
        self.processed_canvas.create_image(
            200, 150,
            image=self.processed_photo
        )
    
    def extract_table(self, image: np.ndarray, table_region: Tuple[int, int, int, int]) -> pd.DataFrame:
        """استخراج جدول من منطقة محددة"""
        x1, y1, x2, y2 = table_region
        table_img = image[y1:y2, x1:x2]
        
        # استخدام Tesseract لاستخراج البيانات
        custom_config = r'--oem 3 --psm 6 -c preserve_interword_spaces=1'
        data = pytesseract.image_to_data(
            table_img,
            config=custom_config,
            output_type=pytesseract.Output.DICT
        )
        
        # تحويل إلى DataFrame
        df = pd.DataFrame(data)
        
        # تصفية الصفوف الفارغة
        df = df[(df['text'].notna()) & (df['text'] != ' ') & (df['text'] != '')]
        
        # تحويل الإحداثيات إلى قيم رقمية
        numeric_cols = ['left', 'top', 'width', 'height', 'conf']
        df[numeric_cols] = df[numeric_cols].apply(pd.to_numeric)
        
        # تنظيم البيانات في جدول
        table_data = []
        current_row = []
        last_top = None
        
        for _, row in df.sort_values(['top', 'left']).iterrows():
            if last_top is None:
                last_top = row['top']
            
            if abs(row['top'] - last_top) > row['height']:
                table_data.append(current_row)
                current_row = [row['text']]
                last_top = row['top']
            else:
                current_row.append(row['text'])
        
        if current_row:
            table_data.append(current_row)
        
        return pd.DataFrame(table_data)
    
    def export_to_excel(self):
        """تصدير الجداول إلى ملف Excel"""
        if not hasattr(self, 'tables') or not self.tables:
            return
            
        filetypes = (("ملفات Excel", "*.xlsx"), ("جميع الملفات", "*.*"))
        output_path = filedialog.asksaveasfilename(
            title="حفظ ملف Excel",
            defaultextension=".xlsx",
            filetypes=filetypes
        )
        
        if output_path:
            try:
                with pd.ExcelWriter(output_path) as writer:
                    for i, table in enumerate(self.tables, 1):
                        table.to_excel(
                            writer,
                            sheet_name=f"Table_{i}",
                            index=False,
                            header=False
                        )
                
                messagebox.showinfo("نجاح", f"تم حفظ الملف بنجاح في:\n{output_path}")
            except Exception as e:
                messagebox.showerror("خطأ", f"فشل في حفظ الملف: {str(e)}")


if __name__ == "__main__":
    root = ctk.CTk()
    app = ImageToExcelApp(root)
    root.mainloop()