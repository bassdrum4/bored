package RocketChicken_fla
{
   import flash.display.MovieClip;
   import flash.text.TextField;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol945")]
   public dynamic class slot_136 extends MovieClip
   {
      
      public var prog:TextField;
      
      public var ova:MovieClip;
      
      public var slo:TextField;
      
      public var con:MovieClip;
      
      public var ov:MovieClip;
      
      public var clear:MovieClip;
      
      public var nam:TextField;
      
      public var cash:TextField;
      
      public var unlocked:TextField;
      
      public function slot_136()
      {
         super();
         addFrameScript(0,this.frame1,1,this.frame2);
      }
      
      internal function frame1() : *
      {
         this.slo.text = "SLOT " + Number(name.toString().charAt(2));
         stop();
      }
      
      internal function frame2() : *
      {
         this.slo.text = "SLOT " + Number(name.toString().charAt(2));
      }
   }
}

