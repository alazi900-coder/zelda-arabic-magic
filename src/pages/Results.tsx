import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Download, FileText, BarChart3 } from "lucide-react";

const Results = () => {
  // TODO: Get actual results from processing state/context
  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/process" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 font-body">
          <ArrowRight className="w-4 h-4" />
          العودة للمعالجة
        </Link>

        <h1 className="text-3xl font-display font-bold mb-8">نتائج التعريب ✅</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold">—</p>
                <p className="text-sm text-muted-foreground">نص تم تعديله</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-secondary" />
              </div>
              <div>
                <p className="text-2xl font-display font-bold">—</p>
                <p className="text-sm text-muted-foreground">حجم الملف</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="font-display">معاينة النصوص المعدلة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-background border border-border rounded-lg p-4 max-h-80 overflow-y-auto font-body text-sm text-muted-foreground">
              <p className="text-center py-8">ستظهر هنا النصوص المعدلة بعد المعالجة</p>
            </div>
          </CardContent>
        </Card>

        {/* Download */}
        <div className="text-center">
          <Button size="lg" disabled className="font-display font-bold text-lg px-10 py-6 bg-primary">
            <Download className="w-5 h-5" />
            تحميل الملف المعرّب
          </Button>
          <p className="text-sm text-muted-foreground mt-3">
            سيكون التحميل متاحاً بعد اكتمال المعالجة
          </p>
        </div>
      </div>
    </div>
  );
};

export default Results;
