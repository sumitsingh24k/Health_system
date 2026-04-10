import RegisterForm from "@/app/register/register-form";

export default function MedicalRegisterPage() {
  return (
    <RegisterForm
      title="Medical Registration"
      endpoint="/api/medical/register"
      roleLabel="MEDICAL"
    />
  );
}
