import { useState, useRef } from "react";
import { DashboardHeader } from "@/components/shared/DashboardHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload as UploadIcon, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useUploadExcel } from "@workspace/api-client-react";
import { UploadExcelBodyDataType } from "@workspace/api-zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [dataType, setDataType] = useState<string>("testcases");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadExcel();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv') || droppedFile.name.endsWith('.xlsx')) {
        setFile(droppedFile);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file || !dataType) return;

    // Convert string to enum type
    const typedDataType = dataType as UploadExcelBodyDataType;

    uploadMutation.mutate({
      data: {
        file,
        dataType: typedDataType
      }
    }, {
      onSuccess: () => {
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    });
  };

  const formatGuide: Record<string, string[]> = {
    testcases: ["Project", "Test Case ID", "Title", "Module", "Priority", "Status", "Assigned To", "Sprint"],
    defects: ["Project", "Defect ID", "Title", "Module", "Severity", "Priority", "Status", "Assigned To"],
    coverage: ["Project", "Module", "Total Requirements", "Covered", "Total Tests", "Passed", "Defect Count"],
    testers: ["Project", "Tester Name", "Tests Executed", "Passed", "Failed", "Defects Found"],
  };

  return (
    <div className="flex-1 overflow-auto bg-background px-4 py-6 md:px-8">
      <div className="max-w-[800px] mx-auto space-y-6">
        <DashboardHeader 
          title="Upload Data" 
          subtitle="Import CSV or Excel files to update dashboard metrics"
        />

        <Card>
          <CardHeader>
            <CardTitle>Import Source Data</CardTitle>
            <CardDescription>Upload files matching the required schema to populate the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="space-y-3">
              <Label>Data Type</Label>
              <Select value={dataType} onValueChange={setDataType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Data Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="testcases">Test Cases</SelectItem>
                  <SelectItem value="defects">Defects</SelectItem>
                  <SelectItem value="coverage">Module Coverage</SelectItem>
                  <SelectItem value="testers">Tester Performance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label>Expected Columns Format</Label>
              <div className="p-3 bg-muted/50 rounded-md text-xs font-mono border flex flex-wrap gap-2 text-muted-foreground">
                {formatGuide[dataType]?.map((col, i) => (
                  <span key={i} className="bg-background px-2 py-1 rounded border shadow-sm">{col}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Note: The project name will automatically be derived from the "Project" column or fallback to "Default Project".
              </p>
            </div>

            <div 
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
                isDragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
              } ${file ? "bg-muted/30" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                className="hidden" 
                ref={fileInputRef} 
                accept=".csv,.xlsx" 
                onChange={handleFileChange}
              />
              
              {file ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <FileSpreadsheet className="w-6 h-6 text-primary" />
                  </div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  <Button variant="ghost" size="sm" className="mt-4" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    Remove file
                  </Button>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                    <UploadIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="font-medium text-foreground">Click to upload or drag and drop</p>
                  <p className="text-sm text-muted-foreground mt-1">CSV or Excel files only (.csv, .xlsx)</p>
                </>
              )}
            </div>

            <Button 
              className="w-full h-11" 
              disabled={!file || uploadMutation.isPending}
              onClick={handleUpload}
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Import Data"
              )}
            </Button>

            {uploadMutation.isSuccess && uploadMutation.data && (
              <Alert className={uploadMutation.data.success ? "bg-green-50 text-green-900 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900" : "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900"}>
                <div className="flex gap-2">
                  {uploadMutation.data.success ? <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />}
                  <div>
                    <AlertTitle>{uploadMutation.data.message}</AlertTitle>
                    <AlertDescription className="mt-2 text-sm space-y-1 opacity-90">
                      <p>Rows Imported: <strong>{uploadMutation.data.rowsImported}</strong></p>
                      {uploadMutation.data.rowsSkipped > 0 && <p>Rows Skipped: <strong>{uploadMutation.data.rowsSkipped}</strong></p>}
                      {uploadMutation.data.errors && uploadMutation.data.errors.length > 0 && (
                        <div className="mt-2 text-xs opacity-80 max-h-32 overflow-y-auto">
                          {uploadMutation.data.errors.map((err, i) => <p key={i}>• {err}</p>)}
                        </div>
                      )}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            )}

            {uploadMutation.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Upload Failed</AlertTitle>
                <AlertDescription>
                  An error occurred while uploading the file. Please check the file format and try again.
                </AlertDescription>
              </Alert>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
