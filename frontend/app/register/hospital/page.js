import RegisterForm from "@/app/register/register-form";

export default function HospitalRegisterPage() {
  return (
    <RegisterForm
      title="Hospital Registration"
      endpoint="/api/hospital/register"
      roleLabel="HOSPITAL"
    />
  );
}
